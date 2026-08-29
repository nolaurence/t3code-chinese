// @effect-diagnostics globalDate:off
import {
  IsoDateTime,
  NonNegativeInt,
  type PiAgentSettings,
  type ProviderRuntimeEvent,
  type ProviderSendTurnInput,
  type ProviderSession,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { getModelSelectionStringOptionValue } from "@t3tools/shared/model";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import { resolveAttachmentPath } from "../../attachmentStore.ts";
import {
  T3_MCP_BEARER_TOKEN_ENV,
  T3_MCP_ENDPOINT_ENV,
} from "../../bundled-pi-extension/contract.ts";
import {
  resolveBundledMidsceneSkillPath,
  resolveBundledPiMcpExtensionPath,
} from "../../bundledSkills.ts";
import { ServerConfig } from "../../config.ts";
import * as McpProviderSession from "../../mcp/McpProviderSession.ts";
import {
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
} from "../Errors.ts";
import { spawnPiRpcClient, type PiRpcClient, type PiRpcClientError } from "../pi/PiRpcClient.ts";
import { makePiRuntimeEventMapper, type PiRuntimeEventMapper } from "../pi/PiRuntimeEvents.ts";
import type { PiRpcOutput, PiRpcResponse } from "../pi/PiRpcProtocol.ts";
import type { PiAdapterShape } from "../Services/PiAdapter.ts";
import type { EventNdjsonLogger } from "./EventNdjsonLogger.ts";

const PI_PROVIDER = ProviderDriverKind.make("piAgent");

export interface PiClientFactoryInput {
  readonly binaryPath: string;
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly args?: ReadonlyArray<string>;
  readonly negotiateProtocolV2?: boolean;
}

export type PiClientFactory = (
  input: PiClientFactoryInput,
) => Effect.Effect<
  PiRpcClient,
  PiRpcClientError,
  Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
>;

export interface PiAdapterOptions {
  readonly provider?: ProviderDriverKind;
  readonly providerName?: string;
  readonly skillFlag?: "--skill" | "--skills";
  readonly instanceId?: ProviderInstanceId;
  readonly environment?: NodeJS.ProcessEnv;
  readonly createClient?: PiClientFactory;
  readonly nativeEventLogger?: EventNdjsonLogger;
  readonly negotiateProtocolV2?: boolean;
  readonly now?: () => string;
  readonly nextTurnId?: () => string;
}

interface PiSessionContext {
  session: ProviderSession;
  readonly scope: Scope.Closeable;
  readonly client: PiRpcClient;
  readonly mapper: PiRuntimeEventMapper;
  readonly sessionId: string;
  readonly sessionFile?: string;
  activeTurnId: TurnId | undefined;
  readonly pendingInputMethods: Map<string, string>;
  processFailed: boolean;
  stopped: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readState(response: PiRpcResponse, providerName: string) {
  if (!response.success) throw new Error(response.error);
  const data = asRecord(response.data);
  if (!data) throw new Error(`${providerName} get_state response did not include state data.`);
  const sessionId = typeof data.sessionId === "string" ? data.sessionId : undefined;
  if (!sessionId) {
    throw new Error(`${providerName} get_state response did not include sessionId.`);
  }
  const sessionFile = typeof data.sessionFile === "string" ? data.sessionFile : undefined;
  const model = asRecord(data.model);
  const modelProvider = typeof model?.provider === "string" ? model.provider : undefined;
  const modelId = typeof model?.id === "string" ? model.id : undefined;
  return {
    sessionId,
    ...(sessionFile ? { sessionFile } : {}),
    ...(modelProvider && modelId ? { model: `${modelProvider}/${modelId}` } : {}),
    ...(data.todoPhases === undefined ? {} : { todoPhases: data.todoPhases }),
  };
}

function promptCompletedWithoutAgent(response: PiRpcResponse): boolean {
  return (
    response.success &&
    response.command === "prompt" &&
    asRecord(response.data)?.agentInvoked === false
  );
}

function readResumeSessionFile(value: unknown): string | undefined {
  const record = asRecord(value);
  return typeof record?.sessionFile === "string" && record.sessionFile.trim().length > 0
    ? record.sessionFile.trim()
    : undefined;
}

const PiMessagesPageData = Schema.Struct({
  messages: Schema.Array(Schema.Unknown),
  totalMessages: NonNegativeInt,
  nextCursor: Schema.optional(Schema.String),
});
const decodePiMessagesPageData = Schema.decodeUnknownSync(PiMessagesPageData);

function readMessageTurns(messages: ReadonlyArray<unknown>, sessionId: string) {
  return messages.flatMap((value, index) => {
    const message = asRecord(value);
    if (message?.role !== "assistant") return [];
    const messageId =
      (typeof message.id === "string" && message.id.trim()) ||
      (typeof message.entryId === "string" && message.entryId.trim()) ||
      `${sessionId}-history-${index}`;
    return [{ id: TurnId.make(messageId), items: [value] }];
  });
}

function readContextMessages(messages: ReadonlyArray<unknown>, sessionId: string) {
  return messages.flatMap((value, index) => {
    const message = asRecord(value);
    if (!message) return [];
    const messageId =
      (typeof message.id === "string" && message.id.trim()) ||
      (typeof message.entryId === "string" && message.entryId.trim()) ||
      `${sessionId}-message-${index}`;
    const role =
      typeof message.role === "string" && message.role.trim().length > 0 ? message.role : null;
    const timestamp = message.timestamp;
    const createdAt =
      typeof timestamp === "string" && timestamp.trim().length > 0
        ? timestamp
        : typeof timestamp === "number" && Number.isFinite(timestamp)
          ? new Date(timestamp).toISOString()
          : null;
    return [{ id: messageId, role, createdAt, content: value }];
  });
}

function splitPiModel(value: string): { provider: string; modelId: string } | null {
  const separator = value.indexOf("/");
  if (separator <= 0 || separator === value.length - 1) return null;
  return { provider: value.slice(0, separator), modelId: value.slice(separator + 1) };
}

function clientFailure(
  provider: ProviderDriverKind,
  providerName: string,
  method: string,
  cause: unknown,
): ProviderAdapterRequestError {
  return new ProviderAdapterRequestError({
    provider,
    method,
    detail: cause instanceof Error ? cause.message : `${providerName} RPC ${method} failed.`,
    cause,
  });
}

function failedTurnMessage(
  events: ReadonlyArray<ProviderRuntimeEvent>,
  providerName: string,
): string | undefined {
  const completed = events.find(
    (event) => event.type === "turn.completed" && event.payload.state === "failed",
  );
  return completed?.type === "turn.completed"
    ? (completed.payload.errorMessage ?? `${providerName} turn failed.`)
    : undefined;
}

const defaultCreateClient: PiClientFactory = (input) =>
  spawnPiRpcClient({
    binaryPath: input.binaryPath,
    cwd: input.cwd,
    ...(input.env ? { env: input.env } : {}),
    ...(input.args ? { args: input.args } : {}),
    ...(input.negotiateProtocolV2 ? { negotiateProtocolV2: true } : {}),
  });

export const makePiAdapter = Effect.fn("makePiAdapter")(function* (
  settings: PiAgentSettings,
  options: PiAdapterOptions = {},
) {
  const serverConfig = yield* ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const crypto = yield* Crypto.Crypto;
  const bundledPiMcpExtensionPath = yield* resolveBundledPiMcpExtensionPath();
  const bundledMidsceneSkillPath = yield* resolveBundledMidsceneSkillPath();
  const provider = options.provider ?? PI_PROVIDER;
  const providerName = options.providerName ?? "Pi";
  const skillFlag = options.skillFlag ?? "--skill";
  const instanceId = options.instanceId ?? ProviderInstanceId.make(provider);
  const createClient = options.createClient ?? defaultCreateClient;
  const now = options.now ?? (() => new Date().toISOString());
  const randomUUIDv4 = crypto.randomUUIDv4.pipe(Effect.orDie);
  const runtimeIdNamespace = yield* randomUUIDv4;
  let runtimeIdSequence = 0;
  const runtimeEvents = yield* Queue.unbounded<ProviderRuntimeEvent>();
  const sessions = new Map<ThreadId, PiSessionContext>();

  const emit = (events: ReadonlyArray<ProviderRuntimeEvent>) =>
    events.length === 0 ? Effect.void : Queue.offerAll(runtimeEvents, events).pipe(Effect.asVoid);

  const logNative = (threadId: ThreadId, raw: PiRpcOutput) =>
    Effect.gen(function* () {
      if (!options.nativeEventLogger) return;
      const observedAt = now();
      yield* options.nativeEventLogger.write(
        {
          observedAt,
          event: {
            id: yield* crypto.randomUUIDv4,
            kind: "notification",
            provider,
            providerInstanceId: instanceId,
            createdAt: observedAt,
            method: raw.type,
            threadId,
            payload: raw,
          },
        },
        threadId,
      );
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning(`Failed to write native ${providerName} RPC event log.`, {
          cause,
          threadId,
          method: raw.type,
        }),
      ),
    );

  const readLegacyMessages = Effect.fn("PiAdapter.readLegacyMessages")(function* (
    context: PiSessionContext,
  ) {
    const response = yield* context.client
      .request({ type: "get_messages" })
      .pipe(
        Effect.mapError((cause) => clientFailure(provider, providerName, "get_messages", cause)),
      );
    const data = asRecord(response.success ? response.data : undefined);
    return Array.isArray(data?.messages) ? data.messages : [];
  });

  const readMessages = Effect.fn("PiAdapter.readMessages")(function* (context: PiSessionContext) {
    if (context.client.protocolVersion !== 2) return yield* readLegacyMessages(context);

    const messages: unknown[] = [];
    const seenCursors = new Set<string>();
    let totalMessages: number | undefined;
    let cursor: string | undefined;
    do {
      const result = yield* context.client
        .request({ type: "get_messages_page", ...(cursor ? { cursor } : {}), limit: 256 })
        .pipe(Effect.result);
      if (Result.isFailure(result)) {
        if (
          result.failure.rpcCode === "session_busy" ||
          result.failure.rpcCode === "stale_cursor"
        ) {
          return yield* readLegacyMessages(context);
        }
        return yield* clientFailure(provider, providerName, "get_messages_page", result.failure);
      }

      const page = yield* Effect.try({
        try: () => {
          if (!result.success.success || result.success.command !== "get_messages_page") {
            throw new Error(`${providerName} get_messages_page returned an invalid response.`);
          }
          return decodePiMessagesPageData(result.success.data);
        },
        catch: (cause) => clientFailure(provider, providerName, "get_messages_page", cause),
      });
      if (totalMessages !== undefined && page.totalMessages !== totalMessages) {
        return yield* clientFailure(
          provider,
          providerName,
          "get_messages_page",
          new Error(`${providerName} message pagination changed its total during traversal.`),
        );
      }
      totalMessages = page.totalMessages;
      messages.push(...page.messages);
      cursor = page.nextCursor;
      if (cursor && seenCursors.has(cursor)) {
        return yield* clientFailure(
          provider,
          providerName,
          "get_messages_page",
          new Error(`${providerName} message pagination repeated a cursor.`),
        );
      }
      if (cursor) seenCursors.add(cursor);
    } while (cursor);

    if (messages.length !== totalMessages) {
      return yield* clientFailure(
        provider,
        providerName,
        "get_messages_page",
        new Error(`${providerName} message pagination ended before the advertised total.`),
      );
    }
    return messages;
  });

  const updateSession = (
    context: PiSessionContext,
    patch: Partial<ProviderSession>,
    clearActiveTurn = false,
    clearLastError = false,
  ) => {
    const updated = { ...context.session, ...patch, updatedAt: IsoDateTime.make(now()) } as
      | ProviderSession
      | (ProviderSession & { activeTurnId?: never });
    if (clearActiveTurn) delete (updated as { activeTurnId?: TurnId }).activeTurnId;
    if (clearLastError) delete (updated as { lastError?: string }).lastError;
    context.session = updated;
  };

  const getContext = (threadId: ThreadId) => {
    const context = sessions.get(threadId);
    return context
      ? Effect.succeed(context)
      : Effect.fail(new ProviderAdapterSessionNotFoundError({ provider, threadId }));
  };

  const finishContextTurn = Effect.fn("PiAdapter.finishContextTurn")(function* (
    context: PiSessionContext,
    mappedEvents: ReadonlyArray<ProviderRuntimeEvent>,
  ) {
    if (!mappedEvents.some((event) => event.type === "turn.completed")) return;
    context.activeTurnId = undefined;
    const turnFailure = failedTurnMessage(mappedEvents, providerName);
    updateSession(
      context,
      turnFailure ? { status: "error", lastError: turnFailure } : { status: "ready" },
      true,
      turnFailure === undefined,
    );
    const stats = yield* context.client.request({ type: "get_session_stats" }).pipe(Effect.option);
    if (stats._tag === "Some" && stats.value.success) {
      yield* emit(context.mapper.updateTokenUsage((asRecord(stats.value.data) ?? {}) as never));
    }
  });

  const stopContext = Effect.fn("PiAdapter.stopContext")(function* (context: PiSessionContext) {
    if (context.stopped) return;
    context.stopped = true;
    sessions.delete(context.session.threadId);
    yield* context.client.close;
    yield* Scope.close(context.scope, Exit.void).pipe(Effect.ignore);
    updateSession(context, { status: "closed" }, true);
  });

  const buildImages = Effect.fn("PiAdapter.buildImages")(function* (input: ProviderSendTurnInput) {
    const images: Array<{ type: "image"; data: string; mimeType: string }> = [];
    for (const attachment of input.attachments ?? []) {
      if (attachment.type !== "image") continue;
      const path = resolveAttachmentPath({
        attachmentsDir: serverConfig.attachmentsDir,
        attachment,
      });
      if (!path) {
        return yield* new ProviderAdapterRequestError({
          provider,
          method: "prompt",
          detail: `Invalid attachment id '${attachment.id}'.`,
        });
      }
      const bytes = yield* fileSystem.readFile(path).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderAdapterRequestError({
              provider,
              method: "prompt",
              detail: `Failed to read attachment '${attachment.name}'.`,
              cause,
            }),
        ),
      );
      images.push({
        type: "image",
        data: Buffer.from(bytes).toString("base64"),
        mimeType: attachment.mimeType,
      });
    }
    return images;
  });

  const startSession: PiAdapterShape["startSession"] = Effect.fn("PiAdapter.startSession")(
    function* (input) {
      if (input.provider && input.provider !== provider) {
        return yield* new ProviderAdapterValidationError({
          provider,
          operation: "startSession",
          issue: `Expected ${provider} provider, received '${input.provider}'.`,
        });
      }
      if (sessions.has(input.threadId)) {
        return yield* new ProviderAdapterValidationError({
          provider,
          operation: "startSession",
          issue: `Thread '${input.threadId}' already has an active ${providerName} session.`,
        });
      }
      const cwd = input.cwd ?? serverConfig.cwd;
      const resumeSessionFile = readResumeSessionFile(input.resumeCursor);
      const mcpSession = McpProviderSession.readMcpProviderSession(input.threadId);
      const piArgs: string[] = [];
      if (mcpSession) {
        for (const [artifact, artifactPath] of [
          ["Pi MCP extension", bundledPiMcpExtensionPath],
          ["Midscene Skill", bundledMidsceneSkillPath],
        ] as const) {
          const exists = yield* fileSystem.exists(artifactPath).pipe(
            Effect.mapError(
              (cause) =>
                new ProviderAdapterRequestError({
                  provider,
                  method: "spawn",
                  detail: `Failed to inspect bundled ${artifact} at '${artifactPath}'.`,
                  cause,
                }),
            ),
          );
          if (!exists) {
            return yield* new ProviderAdapterRequestError({
              provider,
              method: "spawn",
              detail: `Bundled ${artifact} is missing at '${artifactPath}'.`,
            });
          }
        }
        piArgs.push("--extension", bundledPiMcpExtensionPath, skillFlag, bundledMidsceneSkillPath);
      }
      if (resumeSessionFile) piArgs.push("--session", resumeSessionFile);
      const environment = {
        ...options.environment,
        ...(settings.homePath ? { PI_CODING_AGENT_DIR: settings.homePath } : {}),
        ...(mcpSession
          ? {
              [T3_MCP_ENDPOINT_ENV]: mcpSession.endpoint,
              [T3_MCP_BEARER_TOKEN_ENV]: mcpSession.authorizationHeader.replace(/^Bearer\s+/, ""),
            }
          : {}),
      };
      const sessionScope = yield* Scope.make();
      const client = yield* createClient({
        binaryPath: settings.binaryPath,
        cwd,
        ...(Object.keys(environment).length > 0 ? { env: environment } : {}),
        ...(piArgs.length > 0 ? { args: piArgs } : {}),
        ...(options.negotiateProtocolV2 ? { negotiateProtocolV2: true } : {}),
      }).pipe(
        Effect.provideService(Scope.Scope, sessionScope),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, childProcessSpawner),
        Effect.mapError((cause) => clientFailure(provider, providerName, "spawn", cause)),
      );
      const stateResponse = yield* client
        .request({ type: "get_state" })
        .pipe(
          Effect.mapError((cause) => clientFailure(provider, providerName, "get_state", cause)),
        );
      const state = yield* Effect.try({
        try: () => readState(stateResponse, providerName),
        catch: (cause) => clientFailure(provider, providerName, "get_state", cause),
      });
      const timestamp = IsoDateTime.make(now());
      const resumeCursor = {
        sessionId: state.sessionId,
        ...(state.sessionFile ? { sessionFile: state.sessionFile } : {}),
      };
      const session: ProviderSession = {
        provider,
        providerInstanceId: instanceId,
        status: "ready",
        runtimeMode: input.runtimeMode,
        cwd,
        ...(state.model ? { model: state.model } : {}),
        threadId: input.threadId,
        resumeCursor,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const mapper = makePiRuntimeEventMapper({
        provider,
        providerName,
        providerInstanceId: instanceId,
        threadId: input.threadId,
        now,
        nextId: (prefix) =>
          `${input.threadId}-${runtimeIdNamespace}-${prefix}-${++runtimeIdSequence}`,
      });
      const context: PiSessionContext = {
        session,
        scope: sessionScope,
        client,
        mapper,
        sessionId: state.sessionId,
        ...(state.sessionFile ? { sessionFile: state.sessionFile } : {}),
        activeTurnId: undefined,
        pendingInputMethods: new Map(),
        processFailed: false,
        stopped: false,
      };
      sessions.set(input.threadId, context);
      yield* emit([...mapper.startSession(resumeCursor), ...mapper.syncTodoPlan(state.todoPhases)]);

      const handleNativeEvent = Effect.fn("PiAdapter.handleNativeEvent")(function* (
        raw: PiRpcOutput,
      ) {
        if (context.processFailed) return;
        yield* logNative(input.threadId, raw);
        if (raw.type === "extension_ui_request") {
          const record = raw as Record<string, unknown>;
          if (typeof record.id === "string" && typeof record.method === "string") {
            context.pendingInputMethods.set(record.id, record.method);
          }
        }
        const mappedEvents = mapper.map(raw);
        yield* emit(mappedEvents);
        yield* finishContextTurn(context, mappedEvents);
      });
      yield* Stream.runForEach(client.events, handleNativeEvent).pipe(
        Effect.ignoreCause({ log: true }),
        Effect.forkIn(sessionScope, { startImmediately: true }),
      );
      yield* client.terminated.pipe(
        Effect.flatMap((error) =>
          context.stopped
            ? Effect.void
            : Effect.gen(function* () {
                context.processFailed = true;
                context.activeTurnId = undefined;
                updateSession(context, { status: "error", lastError: error.detail }, true);
                yield* emit(mapper.failRuntime(error.detail));
              }),
        ),
        Effect.forkIn(sessionScope, { startImmediately: true }),
      );
      return session;
    },
  );

  const sendTurn: PiAdapterShape["sendTurn"] = Effect.fn("PiAdapter.sendTurn")(function* (input) {
    const context = yield* getContext(input.threadId);
    if (context.activeTurnId) {
      return yield* new ProviderAdapterValidationError({
        provider,
        operation: "sendTurn",
        issue: `Thread '${input.threadId}' already has an active turn.`,
      });
    }
    let nextTurnId = options.nextTurnId?.();
    if (nextTurnId === undefined) {
      nextTurnId = `${provider}-turn-${yield* randomUUIDv4}`;
    }
    const turnId = TurnId.make(nextTurnId);
    const modelSelection =
      input.modelSelection?.instanceId === instanceId ? input.modelSelection : undefined;
    const selectedModel = modelSelection?.model;
    if (selectedModel && selectedModel !== context.session.model) {
      const parsed = splitPiModel(selectedModel);
      if (!parsed) {
        return yield* new ProviderAdapterValidationError({
          provider,
          operation: "sendTurn",
          issue: `${providerName} model '${selectedModel}' must use provider/model format.`,
        });
      }
      yield* context.client
        .request({ type: "set_model", ...parsed })
        .pipe(
          Effect.mapError((cause) => clientFailure(provider, providerName, "set_model", cause)),
        );
    }
    const effort = getModelSelectionStringOptionValue(modelSelection, "effort");
    if (effort) {
      yield* context.client
        .request({ type: "set_thinking_level", level: effort })
        .pipe(
          Effect.mapError((cause) =>
            clientFailure(provider, providerName, "set_thinking_level", cause),
          ),
        );
    }
    const images = yield* buildImages(input);
    context.activeTurnId = turnId;
    updateSession(context, {
      status: "running",
      activeTurnId: turnId,
      ...(selectedModel ? { model: selectedModel } : {}),
    });
    yield* emit(
      context.mapper.startTurn({
        turnId,
        ...(selectedModel ? { model: selectedModel } : {}),
        ...(effort ? { effort } : {}),
      }),
    );
    const promptResponse = yield* context.client
      .request({
        type: "prompt",
        message: input.input ?? "",
        ...(images.length > 0 ? { images } : {}),
      })
      .pipe(Effect.mapError((cause) => clientFailure(provider, providerName, "prompt", cause)));
    if (promptCompletedWithoutAgent(promptResponse)) {
      const mappedEvents = context.mapper.completeTurn("completed", undefined, promptResponse);
      yield* emit(mappedEvents);
      yield* finishContextTurn(context, mappedEvents);
    }
    return { threadId: input.threadId, turnId, resumeCursor: context.session.resumeCursor };
  });

  const interruptTurn: PiAdapterShape["interruptTurn"] = Effect.fn("PiAdapter.interruptTurn")(
    function* (threadId, turnId) {
      const context = yield* getContext(threadId);
      if (!context.activeTurnId || (turnId && turnId !== context.activeTurnId)) return;
      yield* context.client
        .send({ type: "abort" })
        .pipe(Effect.mapError((cause) => clientFailure(provider, providerName, "abort", cause)));
      yield* emit(context.mapper.completeTurn("interrupted"));
      context.activeTurnId = undefined;
      updateSession(context, { status: "ready" }, true);
    },
  );

  const respondToRequest: PiAdapterShape["respondToRequest"] = (threadId) =>
    Effect.fail(
      new ProviderAdapterValidationError({
        provider,
        operation: "respondToRequest",
        issue: `${providerName} session '${threadId}' does not expose built-in tool approvals.`,
      }),
    );

  const respondToUserInput: PiAdapterShape["respondToUserInput"] = Effect.fn(
    "PiAdapter.respondToUserInput",
  )(function* (threadId, requestId, answers) {
    const context = yield* getContext(threadId);
    const method = context.pendingInputMethods.get(requestId);
    if (!method) {
      return yield* new ProviderAdapterValidationError({
        provider,
        operation: "respondToUserInput",
        issue: `Unknown ${providerName} extension input request '${requestId}'.`,
      });
    }
    const answer = answers.value;
    yield* context.client
      .send(
        method === "confirm"
          ? {
              type: "extension_ui_response",
              id: requestId,
              confirmed: answer === true || String(answer).toLowerCase() === "yes",
            }
          : answer === undefined
            ? { type: "extension_ui_response", id: requestId, cancelled: true }
            : { type: "extension_ui_response", id: requestId, value: String(answer) },
      )
      .pipe(
        Effect.mapError((cause) =>
          clientFailure(provider, providerName, "extension_ui_response", cause),
        ),
      );
    context.pendingInputMethods.delete(requestId);
    yield* emit(context.mapper.resolveUserInput(requestId, answer));
  });

  const readThread: PiAdapterShape["readThread"] = Effect.fn("PiAdapter.readThread")(
    function* (threadId) {
      const context = yield* getContext(threadId);
      const messages = yield* readMessages(context);
      return { threadId, turns: readMessageTurns(messages, context.sessionId) };
    },
  );

  const readThreadContext: PiAdapterShape["readThreadContext"] = Effect.fn(
    "PiAdapter.readThreadContext",
  )(function* (threadId) {
    const context = yield* getContext(threadId);
    const messages = yield* readMessages(context);
    return {
      threadId,
      provider,
      messages: readContextMessages(messages, context.sessionId),
    };
  });

  const rollbackThread: PiAdapterShape["rollbackThread"] = (threadId) =>
    Effect.fail(
      new ProviderAdapterValidationError({
        provider,
        operation: "rollbackThread",
        issue: `${providerName} thread '${threadId}' does not support T3 rollback.`,
      }),
    );

  const stopSession: PiAdapterShape["stopSession"] = Effect.fn("PiAdapter.stopSession")(
    function* (threadId) {
      const context = yield* getContext(threadId);
      yield* stopContext(context);
    },
  );

  const stopAll = Effect.fn("PiAdapter.stopAll")(function* () {
    yield* Effect.forEach([...sessions.values()], stopContext, {
      concurrency: "unbounded",
      discard: true,
    });
  });
  yield* Effect.addFinalizer(() => stopAll().pipe(Effect.ignore));

  return {
    provider,
    capabilities: { sessionModelSwitch: "in-session" },
    startSession,
    sendTurn,
    interruptTurn,
    respondToRequest,
    respondToUserInput,
    stopSession,
    listSessions: () => Effect.succeed([...sessions.values()].map((context) => context.session)),
    hasSession: (threadId) => Effect.succeed(sessions.has(threadId)),
    readThread,
    readThreadContext,
    rollbackThread,
    stopAll,
    streamEvents: Stream.fromQueue(runtimeEvents),
  } satisfies PiAdapterShape;
});
