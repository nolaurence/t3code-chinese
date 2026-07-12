import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import {
  PiAgentSettings,
  ApprovalRequestId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { ServerConfig } from "../../config.ts";
import type { PiRpcClient } from "../pi/PiRpcClient.ts";
import type {
  PiAgentEvent,
  PiExtensionUIRequest,
  PiRpcCommand,
  PiRpcResponse,
} from "../pi/PiRpcProtocol.ts";
import { ProviderSessionDirectory } from "../Services/ProviderSessionDirectory.ts";
import { makePiAdapter, type PiClientFactoryInput } from "./PiAdapter.ts";

const decodeSettings = Schema.decodeSync(PiAgentSettings);
const THREAD_ID = ThreadId.make("thread-pi-adapter");
const INSTANCE_ID = ProviderInstanceId.make("piAgent");

const makeHarness = Effect.fn("makePiAdapterTestHarness")(function* (options?: {
  readonly resumeSessionFile?: string;
}) {
  const nativeEvents = yield* Queue.unbounded<PiAgentEvent | PiExtensionUIRequest>();
  const terminated = yield* Deferred.make<never>();
  const commands: PiRpcCommand[] = [];
  const factoryInputs: PiClientFactoryInput[] = [];
  const bindings: unknown[] = [];
  let closeCalls = 0;
  let turnSequence = 0;

  const success = (command: PiRpcCommand, data?: unknown): PiRpcResponse => ({
    type: "response",
    command: command.type,
    success: true,
    ...(data === undefined ? {} : { data }),
  });
  const client: PiRpcClient = {
    request: (command) =>
      Effect.gen(function* () {
        commands.push(command);
        switch (command.type) {
          case "get_state":
            return success(command, {
              sessionId: "pi-session-1",
              sessionFile: options?.resumeSessionFile ?? "/tmp/pi-session-1.jsonl",
              model: { provider: "openai", id: "gpt-5.5" },
              thinkingLevel: "medium",
            });
          case "get_session_stats":
            return success(command, {
              tokens: { input: 10, output: 5, total: 15 },
              toolCalls: 1,
              contextUsage: { contextWindow: 200000 },
            });
          case "get_messages":
            return success(command, { messages: [] });
          default:
            return success(command);
        }
      }),
    send: (command) => Effect.sync(() => void commands.push(command)),
    events: Stream.fromQueue(nativeEvents),
    terminated: Deferred.await(terminated),
    close: Effect.sync(() => {
      closeCalls += 1;
    }),
  };

  const directoryLayer = Layer.succeed(ProviderSessionDirectory, {
    upsert: (binding) => Effect.sync(() => void bindings.push(binding)),
    getProvider: () => Effect.succeed(ProviderDriverKind.make("piAgent")),
    getBinding: () => Effect.succeed(Option.none()),
    listThreadIds: () => Effect.succeed([]),
    listBindings: () => Effect.succeed([]),
  });

  const adapter = yield* makePiAdapter(decodeSettings({ binaryPath: "fake-pi" }), {
    instanceId: INSTANCE_ID,
    createClient: (input) =>
      Effect.sync(() => {
        factoryInputs.push(input);
        return client;
      }),
    now: () => "2026-07-12T00:00:00.000Z",
    nextTurnId: () => `turn-pi-${++turnSequence}`,
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        directoryLayer,
        NodeServices.layer,
        ServerConfig.layerTest("/tmp/project", "/tmp/t3-base").pipe(
          Layer.provide(NodeServices.layer),
        ),
      ),
    ),
  );

  return {
    adapter,
    commands,
    factoryInputs,
    bindings,
    emit: (event: PiAgentEvent | PiExtensionUIRequest) => Queue.offer(nativeEvents, event),
    closeCalls: () => closeCalls,
  };
});

describe("PiAdapter", () => {
  it.effect("starts a Pi RPC session and returns its resume cursor", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness();
        const session = yield* harness.adapter.startSession({
          threadId: THREAD_ID,
          provider: ProviderDriverKind.make("piAgent"),
          providerInstanceId: INSTANCE_ID,
          cwd: "/tmp/project",
          runtimeMode: "full-access",
        });

        expect(session).toMatchObject({
          provider: "piAgent",
          providerInstanceId: "piAgent",
          status: "ready",
          threadId: THREAD_ID,
          model: "openai/gpt-5.5",
          resumeCursor: {
            sessionId: "pi-session-1",
            sessionFile: "/tmp/pi-session-1.jsonl",
          },
        });
        expect(harness.factoryInputs[0]).toMatchObject({
          binaryPath: "fake-pi",
          cwd: "/tmp/project",
        });
        expect(session.resumeCursor).toEqual({
          sessionId: "pi-session-1",
          sessionFile: "/tmp/pi-session-1.jsonl",
        });
      }),
    ),
  );

  it.effect("passes a persisted Pi session file to the client factory", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness({ resumeSessionFile: "/tmp/restored.jsonl" });
        yield* harness.adapter.startSession({
          threadId: THREAD_ID,
          providerInstanceId: INSTANCE_ID,
          cwd: "/tmp/project",
          runtimeMode: "full-access",
          resumeCursor: {
            sessionId: "pi-old-session",
            sessionFile: "/tmp/restored.jsonl",
          },
        });

        expect(harness.factoryInputs[0]?.resumeSessionFile).toBe("/tmp/restored.jsonl");
      }),
    ),
  );

  it.effect("sets model and thinking level before prompting", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness();
        yield* harness.adapter.startSession({
          threadId: THREAD_ID,
          providerInstanceId: INSTANCE_ID,
          cwd: "/tmp/project",
          runtimeMode: "full-access",
        });
        const result = yield* harness.adapter.sendTurn({
          threadId: THREAD_ID,
          input: "Inspect the repository",
          modelSelection: createModelSelection(INSTANCE_ID, "anthropic/claude-sonnet-4-6", [
            { id: "effort", value: "high" },
          ]),
        });

        expect(result.turnId).toBe("turn-pi-1");
        expect(harness.commands.slice(-3)).toEqual([
          {
            type: "set_model",
            provider: "anthropic",
            modelId: "claude-sonnet-4-6",
          },
          { type: "set_thinking_level", level: "high" },
          { type: "prompt", message: "Inspect the repository" },
        ]);
      }),
    ),
  );

  it.effect("maps Pi events and marks the session ready after agent_end", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness();
        yield* harness.adapter.startSession({
          threadId: THREAD_ID,
          providerInstanceId: INSTANCE_ID,
          cwd: "/tmp/project",
          runtimeMode: "full-access",
        });
        yield* harness.adapter.sendTurn({ threadId: THREAD_ID, input: "Hello" });
        const eventsFiber = yield* harness.adapter.streamEvents.pipe(
          Stream.take(12),
          Stream.runCollect,
          Effect.forkChild,
        );

        yield* harness.emit({
          type: "message_update",
          message: {},
          assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hi" },
        });
        yield* harness.emit({ type: "agent_end", messages: [] });

        const events = [...(yield* Fiber.join(eventsFiber))];
        expect(events.some((event) => event.type === "content.delta")).toBe(true);
        expect(events.some((event) => event.type === "turn.completed")).toBe(true);
        expect((yield* harness.adapter.listSessions())[0]).toMatchObject({ status: "ready" });
      }),
    ),
  );

  it.effect("aborts an active turn", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness();
        yield* harness.adapter.startSession({
          threadId: THREAD_ID,
          providerInstanceId: INSTANCE_ID,
          runtimeMode: "full-access",
        });
        const turn = yield* harness.adapter.sendTurn({ threadId: THREAD_ID, input: "Wait" });

        yield* harness.adapter.interruptTurn(THREAD_ID, turn.turnId);

        expect(harness.commands.at(-1)).toEqual({ type: "abort" });
        expect((yield* harness.adapter.listSessions())[0]).toMatchObject({ status: "ready" });
      }),
    ),
  );

  it.effect("returns extension confirmation answers to Pi", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness();
        yield* harness.adapter.startSession({
          threadId: THREAD_ID,
          providerInstanceId: INSTANCE_ID,
          runtimeMode: "full-access",
        });
        yield* harness.adapter.sendTurn({ threadId: THREAD_ID, input: "Run extension" });
        yield* harness.emit({
          type: "extension_ui_request",
          id: "ui-confirm-1",
          method: "confirm",
          title: "Continue?",
          message: "Continue?",
        });
        yield* Effect.yieldNow;

        yield* harness.adapter.respondToUserInput(
          THREAD_ID,
          ApprovalRequestId.make("ui-confirm-1"),
          { value: "Yes" },
        );

        expect(harness.commands.at(-1)).toEqual({
          type: "extension_ui_response",
          id: "ui-confirm-1",
          confirmed: true,
        });
      }),
    ),
  );

  it.effect("closes the Pi client when stopping a session", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness();
        yield* harness.adapter.startSession({
          threadId: THREAD_ID,
          providerInstanceId: INSTANCE_ID,
          runtimeMode: "full-access",
        });

        yield* harness.adapter.stopSession(THREAD_ID);

        expect(harness.closeCalls()).toBe(1);
        expect(yield* harness.adapter.hasSession(THREAD_ID)).toBe(false);
      }),
    ),
  );
});
