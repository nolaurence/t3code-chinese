// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import * as NodePath from "node:path";

import type {
  CopilotSession,
  ModelCapabilitiesOverride,
  PermissionRequest,
  PermissionRequestResult,
  ProviderConfig,
  SessionConfig,
  SessionEvent,
} from "@github/copilot-sdk";
import {
  ApprovalRequestId,
  EventId,
  ProviderDriverKind,
  RuntimeItemId,
  RuntimeRequestId,
  TurnId,
  type CanonicalItemType,
  type CanonicalRequestType,
  type CopilotModelConfigurations,
  type ModelSelection,
  type ProviderApprovalDecision,
  type ProviderInstanceId,
  type ProviderRuntimeEvent,
  type ProviderSession,
  type ProviderUserInputAnswers,
  type ThreadId,
} from "@t3tools/contracts";
import { getModelSelectionStringOptionValue } from "@t3tools/shared/model";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Queue from "effect/Queue";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import { resolveAttachmentPath } from "../../attachmentStore.ts";
import type { CopilotRuntime } from "../copilotRuntime.ts";
import {
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
  type ProviderAdapterError,
} from "../Errors.ts";
import type { ProviderAdapterShape, ProviderThreadSnapshot } from "../Services/ProviderAdapter.ts";

const PROVIDER = ProviderDriverKind.make("githubCopilot");
const REASONING_EFFORTS: ReadonlySet<string> = new Set(["low", "medium", "high", "xhigh", "max"]);
const MAX_CONTEXT_OUTPUT_RESERVE_TOKENS = 16_000;
const nowIso = () => DateTime.formatIso(DateTime.nowUnsafe());
type CopilotReasoningEffort = NonNullable<SessionConfig["reasoningEffort"]>;
type CopilotUserInputHandler = NonNullable<SessionConfig["onUserInputRequest"]>;
type UserInputRequest = Parameters<CopilotUserInputHandler>[0];
type UserInputResponse = { readonly answer: string; readonly wasFreeform: boolean };

function modelContextOverrides(contextWindowTokens: number | undefined):
  | {
      readonly modelCapabilities: ModelCapabilitiesOverride;
      readonly maxPromptTokens: number;
    }
  | undefined {
  if (!contextWindowTokens) return undefined;
  const outputReserve = Math.min(
    MAX_CONTEXT_OUTPUT_RESERVE_TOKENS,
    Math.max(1, Math.floor(contextWindowTokens * 0.1)),
  );
  const maxPromptTokens = Math.max(1, contextWindowTokens - outputReserve);
  return {
    modelCapabilities: {
      limits: {
        max_context_window_tokens: contextWindowTokens,
        max_prompt_tokens: maxPromptTokens,
      },
    },
    maxPromptTokens,
  };
}

function providerWithPromptLimit(
  provider: ProviderConfig,
  maxPromptTokens: number | undefined,
): ProviderConfig {
  return maxPromptTokens ? { ...provider, maxPromptTokens } : provider;
}

const PLAN_MODE_INSTRUCTION = [
  "You are in plan-only mode.",
  "Analyze the request and return a concrete Markdown implementation plan.",
  "You may inspect files, but do not modify files or run commands that change the workspace.",
  "Do not begin implementation until the user explicitly asks you to proceed.",
].join(" ");

interface TrackedTextItem {
  readonly itemId: RuntimeItemId;
  content: string;
  started: boolean;
}

interface TrackedToolItem {
  readonly itemId: RuntimeItemId;
  readonly toolName: string;
  readonly itemType: CanonicalItemType;
  readonly arguments: unknown;
  readonly command: unknown;
  readonly mcpServerName: string | undefined;
  readonly mcpToolName: string | undefined;
  partialOutput: string;
  progressMessage: string;
}

interface ActiveCopilotTurn {
  readonly id: TurnId;
  readonly interactionMode: "default" | "plan";
  readonly items: Array<unknown>;
  readonly messages: Map<string, TrackedTextItem>;
  readonly reasoning: Map<string, TrackedTextItem>;
  readonly tools: Map<string, TrackedToolItem>;
  providerTurnId?: string;
  planMarkdown: string;
  errorMessage?: string;
}

interface PendingApproval {
  readonly requestType: CanonicalRequestType;
  readonly resolve: (result: PermissionRequestResult) => void;
}

interface PendingUserInput {
  readonly choices: ReadonlyArray<string>;
  readonly resolve: (response: UserInputResponse) => void;
}

interface CopilotSessionContext {
  readonly threadId: ThreadId;
  readonly sdkSession: CopilotSession;
  readonly createdAt: string;
  readonly cwd: string;
  readonly runtimeMode: ProviderSession["runtimeMode"];
  readonly turns: Array<{ readonly id: TurnId; readonly items: ReadonlyArray<unknown> }>;
  readonly pendingApprovals: Map<ApprovalRequestId, PendingApproval>;
  readonly pendingUserInputs: Map<ApprovalRequestId, PendingUserInput>;
  model?: string;
  providerId?: string;
  reasoningEffort?: CopilotReasoningEffort;
  activeTurn?: ActiveCopilotTurn;
  turnCount: number;
  stopped: boolean;
  lastError?: string;
}

export function selectCopilotRewindPoint<T>(
  points: ReadonlyArray<T>,
  numTurns: number,
): T | undefined {
  return points[points.length - numTurns];
}

export interface CopilotAdapterOptions {
  readonly instanceId: ProviderInstanceId;
  readonly attachmentsDir: string;
  readonly modelConfigurations?: CopilotModelConfigurations;
}

type CopilotAdapter = ProviderAdapterShape<ProviderAdapterError>;

function parseResumeCursor(value: unknown): { sessionId: string; turnCount: number } | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const sessionId =
    "sessionId" in value && typeof value.sessionId === "string" ? value.sessionId.trim() : "";
  if (!sessionId) {
    return undefined;
  }
  const turnCount =
    "turnCount" in value &&
    typeof value.turnCount === "number" &&
    Number.isSafeInteger(value.turnCount) &&
    value.turnCount >= 0
      ? value.turnCount
      : 0;
  return { sessionId, turnCount };
}

function getReasoningEffort(
  selection: ModelSelection | undefined,
): CopilotReasoningEffort | undefined {
  if (!selection) {
    return undefined;
  }
  const value = getModelSelectionStringOptionValue(selection, "reasoningEffort");
  return value && REASONING_EFFORTS.has(value) ? (value as CopilotReasoningEffort) : undefined;
}

function getPermissionKind(request: PermissionRequest): string {
  return "kind" in request && typeof request.kind === "string" ? request.kind : "unknown";
}

export function copilotPermissionRequestType(request: PermissionRequest): CanonicalRequestType {
  switch (getPermissionKind(request)) {
    case "shell":
      return "command_execution_approval";
    case "read":
      return "file_read_approval";
    case "write":
      return "file_change_approval";
    case "custom-tool":
    case "mcp":
      return "dynamic_tool_call";
    default:
      return "unknown";
  }
}

export function copilotPermissionDetail(request: PermissionRequest): string {
  const kind = getPermissionKind(request);
  if (
    "fullCommandText" in request &&
    typeof request.fullCommandText === "string" &&
    request.fullCommandText.trim()
  ) {
    return request.fullCommandText.trim();
  }
  if ("fileName" in request && typeof request.fileName === "string" && request.fileName.trim()) {
    return `${kind}: ${request.fileName.trim()}`;
  }
  if ("path" in request && typeof request.path === "string" && request.path.trim()) {
    return `${kind}: ${request.path.trim()}`;
  }
  if ("url" in request && typeof request.url === "string" && request.url.trim()) {
    return `${kind}: ${request.url.trim()}`;
  }
  if ("toolName" in request && typeof request.toolName === "string" && request.toolName.trim()) {
    return `${kind}: ${request.toolName.trim()}`;
  }
  return `GitHub Copilot requests ${kind} permission.`;
}

export function shouldAutoApproveCopilotPermission(
  request: PermissionRequest,
  runtimeMode: ProviderSession["runtimeMode"],
): boolean {
  if (request.managedApprovalRequired) return false;
  if (runtimeMode === "full-access") return true;
  return runtimeMode === "auto-accept-edits" && getPermissionKind(request) === "write";
}

export function isCopilotPermissionAllowedInPlanMode(request: PermissionRequest): boolean {
  return ["read", "url"].includes(getPermissionKind(request));
}

function toItemType(
  toolName: string,
  mcpServerName?: string,
  mcpToolName?: string,
): CanonicalItemType {
  if (mcpServerName || mcpToolName) return "mcp_tool_call";
  const normalized = toolName.toLowerCase();
  if (/shell|bash|command|terminal|execute/.test(normalized)) return "command_execution";
  if (/edit|write|patch|create|delete|move/.test(normalized)) return "file_change";
  if (/web|search|fetch/.test(normalized)) return "web_search";
  if (/image|screenshot/.test(normalized)) return "image_view";
  if (/agent|task/.test(normalized)) return "collab_agent_tool_call";
  if (/mcp/.test(normalized)) return "mcp_tool_call";
  return "dynamic_tool_call";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function copilotToolCommand(argumentsValue: unknown, displayCommand: string | undefined): unknown {
  const normalizedDisplayCommand = displayCommand?.trim();
  if (normalizedDisplayCommand) return normalizedDisplayCommand;
  if (typeof argumentsValue === "string") return argumentsValue;
  const argumentsRecord = asRecord(argumentsValue);
  return argumentsRecord?.command ?? argumentsRecord?.cmd ?? argumentsRecord?.script;
}

function formatToolValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (value === undefined || value === null) return undefined;
  const serialized = JSON.stringify(value);
  return typeof serialized === "string" ? serialized.trim() || undefined : undefined;
}

function truncateToolDetailValue(value: string, limit: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1).trimEnd()}…` : normalized;
}

function copilotToolDetail(
  tool: TrackedToolItem,
  output: string | undefined,
  error: string | undefined,
  progress?: string,
): string | undefined {
  if (tool.itemType === "mcp_tool_call") return error;
  const input = tool.command === undefined ? formatToolValue(tool.arguments) : undefined;
  const blocks = [
    ...(input ? [`Input: ${truncateToolDetailValue(input, 80)}`] : []),
    ...(progress ? [`Status: ${truncateToolDetailValue(progress, 120)}`] : []),
    ...(output ? [`Output:\n${output.trim()}`] : []),
    ...(error ? [`Error:\n${error.trim()}`] : []),
  ];
  return blocks.length > 0 ? blocks.join("\n\n") : undefined;
}

function copilotToolData(
  toolCallId: string,
  tool: TrackedToolItem,
  status: "inProgress" | "completed" | "failed",
  rawOutput: unknown,
): Record<string, unknown> {
  if (tool.itemType === "mcp_tool_call") {
    return {
      toolCallId,
      toolName: tool.toolName,
      item: {
        type: "mcpToolCall",
        id: toolCallId,
        tool: tool.mcpToolName ?? tool.toolName,
        ...(tool.mcpServerName ? { server: tool.mcpServerName } : {}),
        status,
        ...(tool.arguments !== undefined ? { arguments: tool.arguments } : {}),
        ...(rawOutput !== undefined ? { result: rawOutput } : {}),
      },
    };
  }
  return {
    toolCallId,
    toolName: tool.toolName,
    ...(tool.command !== undefined ? { command: tool.command } : {}),
    ...(tool.arguments !== undefined ? { arguments: tool.arguments } : {}),
    ...(rawOutput !== undefined ? { rawOutput } : {}),
  };
}

function toApprovalResult(decision: ProviderApprovalDecision): PermissionRequestResult {
  switch (decision) {
    case "accept":
      return { kind: "approve-once", approvedInteractively: true };
    case "acceptForSession":
      return { kind: "approve-for-session" };
    case "decline":
      return { kind: "reject", feedback: "Declined by the user." };
    case "cancel":
      return { kind: "reject", feedback: "Cancelled by the user." };
  }
}

function answerToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").join(", ");
  }
  if (value === null || value === undefined) return "";
  return String(value);
}

function makeRequestError(method: string, cause: unknown): ProviderAdapterRequestError {
  return new ProviderAdapterRequestError({
    provider: PROVIDER,
    method,
    detail: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

export const makeCopilotAdapter = Effect.fn("makeCopilotAdapter")(function* (
  runtime: CopilotRuntime,
  options: CopilotAdapterOptions,
) {
  const sessions = new Map<ThreadId, CopilotSessionContext>();
  const operationLock = yield* Semaphore.make(1);
  const runtimeEvents = yield* Effect.acquireRelease(
    PubSub.unbounded<ProviderRuntimeEvent>(),
    PubSub.shutdown,
  );
  const nativeEvents = yield* Effect.acquireRelease(
    Queue.unbounded<{ readonly threadId: ThreadId; readonly event: SessionEvent }>(),
    Queue.shutdown,
  );

  const cursorFor = (ctx: CopilotSessionContext) => ({
    sessionId: ctx.sdkSession.sessionId,
    turnCount: ctx.turnCount,
  });

  const sessionSnapshot = (ctx: CopilotSessionContext): ProviderSession => ({
    provider: PROVIDER,
    providerInstanceId: options.instanceId,
    status: ctx.stopped ? "closed" : ctx.activeTurn ? "running" : ctx.lastError ? "error" : "ready",
    runtimeMode: ctx.runtimeMode,
    cwd: ctx.cwd,
    ...(ctx.model ? { model: ctx.model } : {}),
    threadId: ctx.threadId,
    resumeCursor: cursorFor(ctx),
    ...(ctx.activeTurn ? { activeTurnId: ctx.activeTurn.id } : {}),
    createdAt: ctx.createdAt,
    updatedAt: nowIso(),
    ...(ctx.lastError ? { lastError: ctx.lastError } : {}),
  });

  const publish = (ctx: CopilotSessionContext, event: ProviderRuntimeEvent) => {
    if (ctx.activeTurn && event.turnId === ctx.activeTurn.id) {
      ctx.activeTurn.items.push(event);
    }
    return PubSub.publish(runtimeEvents, event).pipe(Effect.asVoid);
  };

  const eventBase = (ctx: CopilotSessionContext, event?: SessionEvent) => ({
    eventId: EventId.make(NodeCrypto.randomUUID()),
    provider: PROVIDER,
    providerInstanceId: options.instanceId,
    threadId: ctx.threadId,
    createdAt: event?.timestamp ?? nowIso(),
    ...(event
      ? {
          raw: {
            source: "github.copilot.sdk.event" as const,
            method: event.type,
            payload: event,
          },
        }
      : {}),
  });

  const requireContext = (
    threadId: ThreadId,
  ): Effect.Effect<CopilotSessionContext, ProviderAdapterError> => {
    const ctx = sessions.get(threadId);
    return ctx && !ctx.stopped
      ? Effect.succeed(ctx)
      : Effect.fail(
          new ProviderAdapterSessionNotFoundError({
            provider: PROVIDER,
            threadId,
          }),
        );
  };

  const ensureMessageItem = Effect.fn("ensureCopilotMessageItem")(function* (
    ctx: CopilotSessionContext,
    event: SessionEvent,
    messageId: string,
  ) {
    const turn = ctx.activeTurn;
    if (!turn) return undefined;
    let tracked = turn.messages.get(messageId);
    if (!tracked) {
      tracked = { itemId: RuntimeItemId.make(messageId), content: "", started: false };
      turn.messages.set(messageId, tracked);
    }
    if (!tracked.started) {
      tracked.started = true;
      yield* publish(ctx, {
        type: "item.started",
        ...eventBase(ctx, event),
        turnId: turn.id,
        itemId: tracked.itemId,
        payload: { itemType: "assistant_message", status: "inProgress" },
      });
    }
    return tracked;
  });

  const ensureReasoningItem = Effect.fn("ensureCopilotReasoningItem")(function* (
    ctx: CopilotSessionContext,
    event: SessionEvent,
    reasoningId: string,
  ) {
    const turn = ctx.activeTurn;
    if (!turn) return undefined;
    let tracked = turn.reasoning.get(reasoningId);
    if (!tracked) {
      tracked = { itemId: RuntimeItemId.make(reasoningId), content: "", started: false };
      turn.reasoning.set(reasoningId, tracked);
    }
    if (!tracked.started) {
      tracked.started = true;
      yield* publish(ctx, {
        type: "item.started",
        ...eventBase(ctx, event),
        turnId: turn.id,
        itemId: tracked.itemId,
        payload: {
          itemType: "reasoning",
          status: "inProgress",
          title: "Reasoning",
        },
      });
    }
    return tracked;
  });

  const handleSdkEvent = Effect.fn("handleCopilotSdkEvent")(function* (
    ctx: CopilotSessionContext,
    event: SessionEvent,
  ) {
    const turn = ctx.activeTurn;

    switch (event.type) {
      case "assistant.turn_start": {
        if (turn) turn.providerTurnId = event.data.turnId;
        return;
      }
      case "assistant.message_start": {
        yield* ensureMessageItem(ctx, event, event.data.messageId);
        return;
      }
      case "assistant.message_delta": {
        const tracked = yield* ensureMessageItem(ctx, event, event.data.messageId);
        if (!turn || !tracked) return;
        tracked.content += event.data.deltaContent;
        yield* publish(ctx, {
          type: "content.delta",
          ...eventBase(ctx, event),
          turnId: turn.id,
          itemId: tracked.itemId,
          payload: { streamKind: "assistant_text", delta: event.data.deltaContent },
        });
        if (turn.interactionMode === "plan") {
          turn.planMarkdown += event.data.deltaContent;
          yield* publish(ctx, {
            type: "turn.proposed.delta",
            ...eventBase(ctx, event),
            turnId: turn.id,
            payload: { delta: event.data.deltaContent },
          });
        }
        return;
      }
      case "assistant.message": {
        const tracked = yield* ensureMessageItem(ctx, event, event.data.messageId);
        if (!turn || !tracked) return;
        if (!tracked.content && event.data.content) {
          tracked.content = event.data.content;
          yield* publish(ctx, {
            type: "content.delta",
            ...eventBase(ctx, event),
            turnId: turn.id,
            itemId: tracked.itemId,
            payload: { streamKind: "assistant_text", delta: event.data.content },
          });
          if (turn.interactionMode === "plan") {
            turn.planMarkdown += event.data.content;
            yield* publish(ctx, {
              type: "turn.proposed.delta",
              ...eventBase(ctx, event),
              turnId: turn.id,
              payload: { delta: event.data.content },
            });
          }
        }
        yield* publish(ctx, {
          type: "item.completed",
          ...eventBase(ctx, event),
          turnId: turn.id,
          itemId: tracked.itemId,
          payload: {
            itemType: "assistant_message",
            status: "completed",
            data: { content: event.data.content, model: event.data.model },
          },
        });
        return;
      }
      case "assistant.reasoning_delta": {
        const tracked = yield* ensureReasoningItem(ctx, event, event.data.reasoningId);
        if (!turn || !tracked) return;
        tracked.content += event.data.deltaContent;
        yield* publish(ctx, {
          type: "content.delta",
          ...eventBase(ctx, event),
          turnId: turn.id,
          itemId: tracked.itemId,
          payload: { streamKind: "reasoning_text", delta: event.data.deltaContent },
        });
        return;
      }
      case "assistant.reasoning": {
        const tracked = yield* ensureReasoningItem(ctx, event, event.data.reasoningId);
        if (!turn || !tracked) return;
        if (!tracked.content && event.data.content) {
          tracked.content = event.data.content;
          yield* publish(ctx, {
            type: "content.delta",
            ...eventBase(ctx, event),
            turnId: turn.id,
            itemId: tracked.itemId,
            payload: { streamKind: "reasoning_text", delta: event.data.content },
          });
        }
        yield* publish(ctx, {
          type: "item.completed",
          ...eventBase(ctx, event),
          turnId: turn.id,
          itemId: tracked.itemId,
          payload: {
            itemType: "reasoning",
            status: "completed",
            title: "Reasoning",
            data: { content: event.data.content },
          },
        });
        return;
      }
      case "tool.execution_start": {
        if (!turn) return;
        const itemId = RuntimeItemId.make(event.data.toolCallId);
        const tool: TrackedToolItem = {
          itemId,
          toolName: event.data.toolName,
          itemType: toItemType(
            event.data.toolName,
            event.data.mcpServerName,
            event.data.mcpToolName,
          ),
          arguments: event.data.arguments,
          command: copilotToolCommand(
            event.data.arguments,
            event.data.shellToolInfo?.displayCommand,
          ),
          mcpServerName: event.data.mcpServerName,
          mcpToolName: event.data.mcpToolName,
          partialOutput: "",
          progressMessage: "",
        };
        turn.tools.set(event.data.toolCallId, tool);
        yield* publish(ctx, {
          type: "item.started",
          ...eventBase(ctx, event),
          turnId: turn.id,
          itemId,
          payload: {
            itemType: tool.itemType,
            status: "inProgress",
            title: event.data.toolName,
            ...(tool.itemType !== "mcp_tool_call" && tool.command === undefined
              ? { detail: copilotToolDetail(tool, undefined, undefined) }
              : {}),
            data: copilotToolData(event.data.toolCallId, tool, "inProgress", undefined),
          },
        });
        return;
      }
      case "tool.execution_progress": {
        if (!turn) return;
        const tool = turn.tools.get(event.data.toolCallId);
        if (!tool) return;
        tool.progressMessage = event.data.progressMessage;
        const detail = copilotToolDetail(tool, undefined, undefined, tool.progressMessage);
        yield* publish(ctx, {
          type: "item.updated",
          ...eventBase(ctx, event),
          turnId: turn.id,
          itemId: tool.itemId,
          payload: {
            itemType: tool.itemType,
            status: "inProgress",
            title: tool.toolName,
            ...(detail ? { detail } : {}),
            data: copilotToolData(event.data.toolCallId, tool, "inProgress", undefined),
          },
        });
        return;
      }
      case "tool.execution_partial_result": {
        if (!turn) return;
        const tool = turn.tools.get(event.data.toolCallId);
        if (!tool) return;
        tool.partialOutput += event.data.partialOutput;
        const detail = copilotToolDetail(tool, tool.partialOutput, undefined);
        yield* publish(ctx, {
          type: "item.updated",
          ...eventBase(ctx, event),
          turnId: turn.id,
          itemId: tool.itemId,
          payload: {
            itemType: tool.itemType,
            status: "inProgress",
            title: tool.toolName,
            ...(detail ? { detail } : {}),
            data: copilotToolData(event.data.toolCallId, tool, "inProgress", tool.partialOutput),
          },
        });
        return;
      }
      case "tool.execution_complete": {
        if (!turn) return;
        const tool = turn.tools.get(event.data.toolCallId);
        const itemId = tool?.itemId ?? RuntimeItemId.make(event.data.toolCallId);
        const toolName = tool?.toolName ?? "Tool";
        const trackedTool =
          tool ??
          ({
            itemId,
            toolName,
            itemType: toItemType(toolName),
            arguments: undefined,
            command: undefined,
            mcpServerName: undefined,
            mcpToolName: undefined,
            partialOutput: "",
            progressMessage: "",
          } satisfies TrackedToolItem);
        const output =
          event.data.result?.detailedContent ??
          event.data.result?.content ??
          (trackedTool.partialOutput.trim() || undefined);
        const error = event.data.error?.message;
        const detail = copilotToolDetail(
          trackedTool,
          output,
          error,
          output || error ? undefined : trackedTool.progressMessage || undefined,
        );
        turn.tools.delete(event.data.toolCallId);
        yield* publish(ctx, {
          type: "item.completed",
          ...eventBase(ctx, event),
          turnId: turn.id,
          itemId,
          payload: {
            itemType: trackedTool.itemType,
            status: event.data.success ? "completed" : "failed",
            title: toolName,
            ...(detail ? { detail } : {}),
            data: copilotToolData(
              event.data.toolCallId,
              trackedTool,
              event.data.success ? "completed" : "failed",
              event.data.result ?? output,
            ),
          },
        });
        return;
      }
      case "session.error": {
        ctx.lastError = event.data.message;
        if (turn) turn.errorMessage = event.data.message;
        yield* publish(ctx, {
          type: "runtime.error",
          ...eventBase(ctx, event),
          ...(turn ? { turnId: turn.id } : {}),
          payload: {
            message: event.data.message,
            class:
              event.data.errorType === "authentication" ? "permission_error" : "provider_error",
            detail: event.data,
          },
        });
        return;
      }
      case "session.idle": {
        if (!turn) return;
        if (turn.interactionMode === "plan" && turn.planMarkdown.trim()) {
          yield* publish(ctx, {
            type: "turn.proposed.completed",
            ...eventBase(ctx, event),
            turnId: turn.id,
            payload: { planMarkdown: turn.planMarkdown.trim() },
          });
        }
        if (event.data.aborted) {
          yield* publish(ctx, {
            type: "turn.aborted",
            ...eventBase(ctx, event),
            turnId: turn.id,
            payload: { reason: "GitHub Copilot turn was interrupted." },
          });
        } else {
          yield* publish(ctx, {
            type: "turn.completed",
            ...eventBase(ctx, event),
            turnId: turn.id,
            payload: {
              state: turn.errorMessage ? "failed" : "completed",
              ...(turn.errorMessage ? { errorMessage: turn.errorMessage } : {}),
            },
          });
        }
        ctx.turns.push({ id: turn.id, items: [...turn.items] });
        ctx.turnCount += 1;
        delete ctx.activeTurn;
        yield* publish(ctx, {
          type: "thread.state.changed",
          ...eventBase(ctx, event),
          payload: { state: "idle" },
        });
        yield* publish(ctx, {
          type: "session.state.changed",
          ...eventBase(ctx, event),
          payload: { state: ctx.lastError ? "error" : "ready" },
        });
        return;
      }
      default:
        return;
    }
  });

  yield* Effect.forever(
    Queue.take(nativeEvents).pipe(
      Effect.flatMap(({ threadId, event }) => {
        const ctx = sessions.get(threadId);
        return ctx && !ctx.stopped ? handleSdkEvent(ctx, event) : Effect.void;
      }),
      Effect.catchCause((cause) =>
        Effect.logError("GitHub Copilot SDK event mapping failed", cause),
      ),
    ),
  ).pipe(Effect.forkScoped);

  const enqueueNativeEvent = (threadId: ThreadId, event: SessionEvent): void => {
    Effect.runSync(Queue.offer(nativeEvents, { threadId, event }));
  };

  const emitPermissionRequest = (
    ctx: CopilotSessionContext,
    request: PermissionRequest,
  ): Promise<PermissionRequestResult> => {
    if (
      ctx.activeTurn?.interactionMode === "plan" &&
      !isCopilotPermissionAllowedInPlanMode(request)
    ) {
      return Promise.resolve({
        kind: "reject",
        feedback: "Write and execution permissions are disabled in plan mode.",
      });
    }
    if (shouldAutoApproveCopilotPermission(request, ctx.runtimeMode)) {
      return Promise.resolve({ kind: "approve-once" });
    }

    const requestId = ApprovalRequestId.make(NodeCrypto.randomUUID());
    const requestType = copilotPermissionRequestType(request);
    return new Promise((resolveDecision) => {
      ctx.pendingApprovals.set(requestId, { requestType, resolve: resolveDecision });
      Effect.runFork(
        publish(ctx, {
          type: "request.opened",
          ...eventBase(ctx),
          requestId: RuntimeRequestId.make(requestId),
          ...(ctx.activeTurn ? { turnId: ctx.activeTurn.id } : {}),
          payload: {
            requestType,
            detail: copilotPermissionDetail(request),
            args: request,
          },
        }),
      );
    });
  };

  const emitUserInputRequest = (
    ctx: CopilotSessionContext,
    request: UserInputRequest,
  ): Promise<UserInputResponse> => {
    const requestId = ApprovalRequestId.make(NodeCrypto.randomUUID());
    const choices = request.choices ?? [];
    return new Promise((resolveResponse) => {
      ctx.pendingUserInputs.set(requestId, { choices, resolve: resolveResponse });
      Effect.runFork(
        publish(ctx, {
          type: "user-input.requested",
          ...eventBase(ctx),
          requestId: RuntimeRequestId.make(requestId),
          ...(ctx.activeTurn ? { turnId: ctx.activeTurn.id } : {}),
          payload: {
            questions: [
              {
                id: requestId,
                header: "GitHub Copilot",
                question: request.question,
                options: choices.map((choice) => ({
                  label: choice,
                  description: `Choose ${choice}.`,
                })),
                multiSelect: false,
              },
            ],
          },
        }),
      );
    });
  };

  const stopContext = Effect.fn("stopCopilotSession")(function* (ctx: CopilotSessionContext) {
    if (ctx.stopped) return;
    ctx.stopped = true;
    for (const pending of ctx.pendingApprovals.values()) {
      pending.resolve({ kind: "reject", feedback: "The session was stopped." });
    }
    ctx.pendingApprovals.clear();
    for (const pending of ctx.pendingUserInputs.values()) {
      pending.resolve({ answer: "", wasFreeform: true });
    }
    ctx.pendingUserInputs.clear();

    yield* Effect.tryPromise({
      try: async () => {
        let abortCause: unknown;
        try {
          await ctx.sdkSession.abort();
        } catch (cause) {
          abortCause = cause;
        }
        try {
          await ctx.sdkSession.disconnect();
        } catch (disconnectCause) {
          if (abortCause !== undefined) {
            // eslint-disable-next-line preserve-caught-error -- AggregateError retains both shutdown failures.
            throw new Error("Failed to stop Copilot session.", {
              cause: new AggregateError([abortCause, disconnectCause]),
            });
          }
          throw disconnectCause;
        }
        if (abortCause !== undefined) throw abortCause;
      },
      catch: (cause) => makeRequestError("session.stop", cause),
    });
    sessions.delete(ctx.threadId);
    yield* publish(ctx, {
      type: "session.exited",
      ...eventBase(ctx),
      payload: { exitKind: "graceful" },
    });
  });

  const startSession: CopilotAdapter["startSession"] = (input) =>
    operationLock.withPermit(
      Effect.gen(function* () {
        if (input.provider !== undefined && input.provider !== PROVIDER) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "startSession",
            issue: `Expected provider '${PROVIDER}' but received '${input.provider}'.`,
          });
        }
        if (
          input.providerInstanceId !== undefined &&
          input.providerInstanceId !== options.instanceId
        ) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "startSession",
            issue: `Expected provider instance '${options.instanceId}'.`,
          });
        }
        if (!input.cwd?.trim()) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "startSession",
            issue: "cwd is required and must be non-empty.",
          });
        }

        const existing = sessions.get(input.threadId);
        if (existing && !existing.stopped) yield* stopContext(existing);

        const cwd = NodePath.resolve(input.cwd.trim());
        const resume = parseResumeCursor(input.resumeCursor);
        const model = input.modelSelection?.model;
        const reasoningEffort = getReasoningEffort(input.modelSelection);
        const resolvedModel = yield* Effect.try({
          try: () => runtime.resolveModel(model),
          catch: (cause) => makeRequestError("session.resolveModel", cause),
        });
        const modelConfiguration = resolvedModel.configuration;
        const contextOverrides = modelContextOverrides(modelConfiguration?.contextWindowTokens);
        const earlyEvents: SessionEvent[] = [];
        let ctx: CopilotSessionContext | undefined;
        const onEvent = (event: SessionEvent) => {
          if (ctx) enqueueNativeEvent(input.threadId, event);
          else earlyEvents.push(event);
        };

        const sdkSession = yield* Effect.tryPromise({
          try: () => {
            const config = {
              workingDirectory: cwd,
              ...(resolvedModel.sdkModel ? { model: resolvedModel.sdkModel } : {}),
              ...(reasoningEffort ? { reasoningEffort } : {}),
              ...(contextOverrides
                ? { modelCapabilities: contextOverrides.modelCapabilities }
                : {}),
              ...(resolvedModel.provider
                ? {
                    provider: providerWithPromptLimit(
                      resolvedModel.provider,
                      contextOverrides?.maxPromptTokens,
                    ),
                  }
                : {}),
              streaming: true,
              enableFileChangeTracking: true,
              clientName: "T3 Code",
              onEvent,
              onPermissionRequest: (
                request: PermissionRequest,
              ): PermissionRequestResult | Promise<PermissionRequestResult> => {
                if (!ctx) return { kind: "reject", feedback: "Session is still starting." };
                return emitPermissionRequest(ctx, request);
              },
              onUserInputRequest: (request: UserInputRequest) => {
                if (!ctx) return { answer: "", wasFreeform: true };
                return emitUserInputRequest(ctx, request);
              },
            };
            return resume
              ? runtime.resumeSession(resume.sessionId, {
                  ...config,
                  continuePendingWork: false,
                })
              : runtime.createSession(config);
          },
          catch: (cause) => makeRequestError(resume ? "session.resume" : "session.create", cause),
        });

        const now = nowIso();
        ctx = {
          threadId: input.threadId,
          sdkSession,
          createdAt: now,
          cwd,
          runtimeMode: input.runtimeMode,
          ...(model ? { model } : {}),
          ...(resolvedModel.providerId ? { providerId: resolvedModel.providerId } : {}),
          ...(reasoningEffort ? { reasoningEffort } : {}),
          turns: [],
          pendingApprovals: new Map(),
          pendingUserInputs: new Map(),
          turnCount: resume?.turnCount ?? 0,
          stopped: false,
        };
        sessions.set(input.threadId, ctx);
        for (const event of earlyEvents) enqueueNativeEvent(input.threadId, event);

        yield* publish(ctx, {
          type: "session.started",
          ...eventBase(ctx),
          payload: {
            message: resume
              ? "Resumed GitHub Copilot SDK session."
              : "Started GitHub Copilot SDK session.",
            resume: cursorFor(ctx),
          },
        });
        yield* publish(ctx, {
          type: "thread.started",
          ...eventBase(ctx),
          payload: { providerThreadId: sdkSession.sessionId },
        });
        yield* publish(ctx, {
          type: "session.state.changed",
          ...eventBase(ctx),
          payload: { state: "ready" },
        });
        return sessionSnapshot(ctx);
      }),
    );

  const sendTurn: CopilotAdapter["sendTurn"] = (input) =>
    operationLock.withPermit(
      Effect.gen(function* () {
        const ctx = yield* requireContext(input.threadId);
        if (ctx.activeTurn) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "sendTurn",
            issue: `Thread '${input.threadId}' already has an active turn.`,
          });
        }
        const prompt = input.input?.trim() ?? "";
        if (!prompt && (input.attachments?.length ?? 0) === 0) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "sendTurn",
            issue: "A prompt or attachment is required.",
          });
        }

        const nextModel = input.modelSelection?.model;
        const nextEffort = getReasoningEffort(input.modelSelection);
        if (nextModel && (nextModel !== ctx.model || nextEffort !== ctx.reasoningEffort)) {
          const resolvedNextModel = yield* Effect.try({
            try: () => runtime.resolveModel(nextModel),
            catch: (cause) => makeRequestError("session.resolveModel", cause),
          });
          if (resolvedNextModel.providerId !== ctx.providerId) {
            return yield* new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "sendTurn",
              issue: "Changing the Copilot LLM provider requires a new thread.",
            });
          }
          const nextContextOverrides = modelContextOverrides(
            resolvedNextModel.configuration?.contextWindowTokens,
          );
          yield* Effect.tryPromise({
            try: () =>
              ctx.sdkSession.setModel(resolvedNextModel.sdkModel ?? nextModel, {
                ...(nextEffort ? { reasoningEffort: nextEffort } : {}),
                ...(nextContextOverrides
                  ? { modelCapabilities: nextContextOverrides.modelCapabilities }
                  : {}),
              }),
            catch: (cause) => makeRequestError("session.setModel", cause),
          });
          ctx.model = nextModel;
          if (nextEffort) ctx.reasoningEffort = nextEffort;
          else delete ctx.reasoningEffort;
        }

        const turnId = TurnId.make(NodeCrypto.randomUUID());
        const interactionMode = input.interactionMode ?? "default";
        delete ctx.lastError;
        ctx.activeTurn = {
          id: turnId,
          interactionMode,
          items: [],
          messages: new Map(),
          reasoning: new Map(),
          tools: new Map(),
          planMarkdown: "",
        };

        yield* publish(ctx, {
          type: "turn.started",
          ...eventBase(ctx),
          turnId,
          payload: {
            ...(ctx.model ? { model: ctx.model } : {}),
            ...(ctx.reasoningEffort ? { effort: ctx.reasoningEffort } : {}),
          },
        });
        yield* publish(ctx, {
          type: "session.state.changed",
          ...eventBase(ctx),
          turnId,
          payload: { state: "running" },
        });
        yield* publish(ctx, {
          type: "thread.state.changed",
          ...eventBase(ctx),
          turnId,
          payload: { state: "active" },
        });

        const attachments = (input.attachments ?? []).flatMap((attachment) => {
          const path = resolveAttachmentPath({
            attachmentsDir: options.attachmentsDir,
            attachment,
          });
          return path ? [{ type: "file" as const, path, displayName: attachment.name }] : [];
        });
        const effectivePrompt =
          interactionMode === "plan"
            ? `${PLAN_MODE_INSTRUCTION}\n\nUser request:\n${prompt}`
            : prompt;

        yield* Effect.tryPromise({
          try: () =>
            ctx.sdkSession.send({
              prompt: effectivePrompt || "Use the attached file as the user request context.",
              ...(attachments.length > 0 ? { attachments } : {}),
              agentMode:
                interactionMode === "plan"
                  ? "plan"
                  : ctx.runtimeMode === "auto"
                    ? "autopilot"
                    : "interactive",
            }),
          catch: (cause) => makeRequestError("session.send", cause),
        }).pipe(
          Effect.tapError((error) =>
            Effect.gen(function* () {
              const activeTurn = ctx.activeTurn;
              if (!activeTurn) return;
              activeTurn.errorMessage = error.message;
              ctx.lastError = error.message;
              yield* publish(ctx, {
                type: "runtime.error",
                ...eventBase(ctx),
                turnId: activeTurn.id,
                payload: { message: error.message, class: "transport_error" },
              });
              yield* publish(ctx, {
                type: "turn.completed",
                ...eventBase(ctx),
                turnId: activeTurn.id,
                payload: { state: "failed", errorMessage: error.message },
              });
              ctx.turns.push({ id: activeTurn.id, items: [...activeTurn.items] });
              ctx.turnCount += 1;
              delete ctx.activeTurn;
              yield* publish(ctx, {
                type: "thread.state.changed",
                ...eventBase(ctx),
                payload: { state: "idle" },
              });
              yield* publish(ctx, {
                type: "session.state.changed",
                ...eventBase(ctx),
                payload: { state: "error" },
              });
            }),
          ),
        );

        return {
          threadId: input.threadId,
          turnId,
          resumeCursor: cursorFor(ctx),
        };
      }),
    );

  const interruptTurn: CopilotAdapter["interruptTurn"] = (threadId, turnId) =>
    operationLock.withPermit(
      Effect.gen(function* () {
        const ctx = yield* requireContext(threadId);
        if (turnId && ctx.activeTurn?.id !== turnId) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "interruptTurn",
            issue: `Turn '${turnId}' is not active for thread '${threadId}'.`,
          });
        }
        yield* Effect.tryPromise({
          try: () => ctx.sdkSession.abort(),
          catch: (cause) => makeRequestError("session.abort", cause),
        });
      }),
    );

  const respondToRequest: CopilotAdapter["respondToRequest"] = (threadId, requestId, decision) =>
    operationLock.withPermit(
      Effect.gen(function* () {
        const ctx = yield* requireContext(threadId);
        const pending = ctx.pendingApprovals.get(requestId);
        if (!pending) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "respondToRequest",
            issue: `Unknown permission request '${requestId}'.`,
          });
        }
        ctx.pendingApprovals.delete(requestId);
        pending.resolve(toApprovalResult(decision));
        yield* publish(ctx, {
          type: "request.resolved",
          ...eventBase(ctx),
          requestId: RuntimeRequestId.make(requestId),
          ...(ctx.activeTurn ? { turnId: ctx.activeTurn.id } : {}),
          payload: { requestType: pending.requestType, decision },
        });
      }),
    );

  const respondToUserInput: CopilotAdapter["respondToUserInput"] = (threadId, requestId, answers) =>
    operationLock.withPermit(
      Effect.gen(function* () {
        const ctx = yield* requireContext(threadId);
        const pending = ctx.pendingUserInputs.get(requestId);
        if (!pending) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "respondToUserInput",
            issue: `Unknown user input request '${requestId}'.`,
          });
        }
        const answer = answerToString(answers[requestId] ?? firstAnswer(answers));
        ctx.pendingUserInputs.delete(requestId);
        pending.resolve({
          answer,
          wasFreeform: !pending.choices.includes(answer),
        });
        yield* publish(ctx, {
          type: "user-input.resolved",
          ...eventBase(ctx),
          requestId: RuntimeRequestId.make(requestId),
          ...(ctx.activeTurn ? { turnId: ctx.activeTurn.id } : {}),
          payload: { answers },
        });
      }),
    );

  const readThread: CopilotAdapter["readThread"] = (threadId) =>
    requireContext(threadId).pipe(
      Effect.map(
        (ctx): ProviderThreadSnapshot => ({
          threadId,
          turns: [
            ...ctx.turns,
            ...(ctx.activeTurn ? [{ id: ctx.activeTurn.id, items: ctx.activeTurn.items }] : []),
          ],
        }),
      ),
    );

  const rollbackThread: CopilotAdapter["rollbackThread"] = (threadId, numTurns) =>
    operationLock.withPermit(
      Effect.gen(function* () {
        const ctx = yield* requireContext(threadId);
        if (!Number.isSafeInteger(numTurns) || numTurns <= 0) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "rollbackThread",
            issue: "numTurns must be a positive integer.",
          });
        }
        if (ctx.activeTurn) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "rollbackThread",
            issue: "Cannot roll back while a turn is active.",
          });
        }

        const rewindPoints = yield* Effect.tryPromise({
          try: () => ctx.sdkSession.rpc.history.listRewindPoints(),
          catch: (cause) => makeRequestError("history.listRewindPoints", cause),
        });
        const boundary = selectCopilotRewindPoint(rewindPoints.points, numTurns);
        if (!boundary) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "rollbackThread",
            issue: `Cannot roll back ${numTurns} turn(s); only ${rewindPoints.points.length} rewind point(s) exist.`,
          });
        }
        const result = yield* Effect.tryPromise({
          try: () =>
            ctx.sdkSession.rpc.history.rewind({
              eventId: boundary.eventId,
              mode: "conversation",
            }),
          catch: (cause) => makeRequestError("history.rewind", cause),
        });
        if (
          !["success", "checkpoint-cleanup-failed", "snapshot-prune-failed"].includes(
            result.outcome,
          )
        ) {
          return yield* new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "history.rewind",
            detail:
              result.error ?? `GitHub Copilot rewind failed with outcome '${result.outcome}'.`,
          });
        }

        ctx.turnCount = Math.max(0, ctx.turnCount - numTurns);
        ctx.turns.splice(Math.max(0, ctx.turns.length - numTurns), numTurns);
        return {
          threadId,
          turns: [...ctx.turns],
        } satisfies ProviderThreadSnapshot;
      }),
    );

  const stopSession: CopilotAdapter["stopSession"] = (threadId) =>
    operationLock.withPermit(requireContext(threadId).pipe(Effect.flatMap(stopContext)));

  const stopAll: CopilotAdapter["stopAll"] = () =>
    operationLock.withPermit(
      Effect.forEach([...sessions.values()], stopContext, { concurrency: 1 }).pipe(Effect.asVoid),
    );

  const adapter = {
    provider: PROVIDER,
    capabilities: { sessionModelSwitch: "in-session" },
    startSession,
    sendTurn,
    interruptTurn,
    respondToRequest,
    respondToUserInput,
    stopSession,
    listSessions: () => Effect.succeed([...sessions.values()].map(sessionSnapshot)),
    hasSession: (threadId) => Effect.succeed(sessions.has(threadId)),
    readThread,
    rollbackThread,
    stopAll,
    streamEvents: Stream.fromPubSub(runtimeEvents),
  } satisfies CopilotAdapter;

  return adapter;
});

function firstAnswer(answers: ProviderUserInputAnswers): unknown {
  return Object.values(answers)[0];
}
