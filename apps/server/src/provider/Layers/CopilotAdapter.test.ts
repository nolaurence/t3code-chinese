import type {
  CopilotSession,
  PermissionRequest,
  SessionConfig,
  SessionEvent,
} from "@github/copilot-sdk";
import { describe, expect, it, vi } from "@effect/vitest";
import {
  makeCopilotLlmModelSlug,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";

import type { CopilotRuntime } from "../copilotRuntime.ts";

import {
  copilotPermissionDetail,
  copilotPermissionRequestType,
  isCopilotPermissionAllowedInPlanMode,
  makeCopilotAdapter,
  selectCopilotRewindPoint,
  shouldAutoApproveCopilotPermission,
} from "./CopilotAdapter.ts";

const shellRequest: PermissionRequest = {
  kind: "shell",
  canOfferSessionApproval: true,
  commands: [],
  fullCommandText: "pnpm test",
  hasWriteFileRedirection: false,
  intention: "Run tests",
  possiblePaths: [],
  possibleUrls: [],
};

const writeRequest: PermissionRequest = {
  kind: "write",
  canOfferSessionApproval: true,
  diff: "+const ready = true;",
  fileName: "src/copilot.ts",
  intention: "Update the integration",
};

const readRequest: PermissionRequest = {
  kind: "read",
  intention: "Inspect the integration",
  path: "src/copilot.ts",
};

const customToolRequest: PermissionRequest = {
  kind: "custom-tool",
  toolDescription: "Run a custom operation",
  toolName: "custom_operation",
};

describe("Copilot permission mapping", () => {
  it("maps current SDK permission discriminators and details", () => {
    expect(copilotPermissionRequestType(shellRequest)).toBe("command_execution_approval");
    expect(copilotPermissionDetail(shellRequest)).toBe("pnpm test");
    expect(copilotPermissionRequestType(writeRequest)).toBe("file_change_approval");
    expect(copilotPermissionDetail(writeRequest)).toBe("write: src/copilot.ts");
    expect(copilotPermissionRequestType(customToolRequest)).toBe("dynamic_tool_call");
  });

  it("honors runtime modes without bypassing managed approvals", () => {
    expect(shouldAutoApproveCopilotPermission(shellRequest, "full-access")).toBe(true);
    expect(shouldAutoApproveCopilotPermission(writeRequest, "auto-accept-edits")).toBe(true);
    expect(shouldAutoApproveCopilotPermission(readRequest, "auto-accept-edits")).toBe(false);
    expect(
      shouldAutoApproveCopilotPermission(
        { ...writeRequest, managedApprovalRequired: true },
        "full-access",
      ),
    ).toBe(false);
  });

  it("allows only read-only permission kinds in plan mode", () => {
    expect(isCopilotPermissionAllowedInPlanMode(readRequest)).toBe(true);
    expect(isCopilotPermissionAllowedInPlanMode(writeRequest)).toBe(false);
    expect(isCopilotPermissionAllowedInPlanMode(shellRequest)).toBe(false);
  });
});

describe("Copilot rewind selection", () => {
  it("selects the SDK rewind point at the requested turn boundary", () => {
    const points = ["first", "second", "third"];
    expect(selectCopilotRewindPoint(points, 1)).toBe("third");
    expect(selectCopilotRewindPoint(points, 2)).toBe("second");
    expect(selectCopilotRewindPoint(points, 4)).toBeUndefined();
  });
});

describe("Copilot turn lifecycle", () => {
  it.effect("maps a completed SDK response and restores the ready session state", () =>
    Effect.gen(function* () {
      const instanceId = ProviderInstanceId.make("githubCopilot");
      const threadId = ThreadId.make("copilot-success");
      let onEvent: SessionConfig["onEvent"];
      let sessionConfig: SessionConfig | undefined;
      const send = vi.fn(() => Promise.resolve("assistant-1"));
      const setModel = vi.fn(() => Promise.resolve());
      const sdkSession = {
        sessionId: "copilot-session",
        send,
        setModel,
        abort: vi.fn(() => Promise.resolve()),
        disconnect: vi.fn(() => Promise.resolve()),
      } as unknown as CopilotSession;
      const runtime: CopilotRuntime = {
        sessionProvider: {
          type: "openai",
          baseUrl: "https://gateway.example.com/v1",
          apiKey: "sk-test",
        },
        resolveModel: (model) => ({
          selectionModel: model,
          sdkModel: model,
          provider: {
            type: "openai",
            baseUrl: "https://gateway.example.com/v1",
            apiKey: "sk-test",
          },
          providerId: "legacy",
          configuration:
            model === "gpt-custom"
              ? { contextWindowTokens: 262_144 }
              : model === "gpt-next"
                ? { contextWindowTokens: 100_000 }
                : undefined,
        }),
        ensureStarted: () => Promise.reject(new Error("not used by this test")),
        ping: () => Promise.reject(new Error("not used by this test")),
        getAuthStatus: () => Promise.reject(new Error("not used by this test")),
        listModels: () => Promise.resolve([]),
        createSession: (config) => {
          sessionConfig = config;
          onEvent = config.onEvent;
          return Promise.resolve(sdkSession);
        },
        resumeSession: () => Promise.resolve(sdkSession),
        close: () => Promise.resolve(),
      };
      const adapter = yield* makeCopilotAdapter(runtime, {
        instanceId,
        attachmentsDir: process.cwd(),
        modelConfigurations: {
          "gpt-custom": { contextWindowTokens: 262_144 },
          "gpt-next": { contextWindowTokens: 100_000 },
        },
      });

      yield* adapter.startSession({
        threadId,
        provider: ProviderDriverKind.make("githubCopilot"),
        providerInstanceId: instanceId,
        cwd: process.cwd(),
        runtimeMode: "auto",
        modelSelection: {
          instanceId,
          model: "gpt-custom",
          options: [{ id: "reasoningEffort", value: "high" }],
        },
      });
      expect(sessionConfig).toMatchObject({
        model: "gpt-custom",
        reasoningEffort: "high",
        modelCapabilities: {
          limits: {
            max_context_window_tokens: 262_144,
            max_prompt_tokens: 246_144,
          },
        },
        provider: {
          type: "openai",
          baseUrl: "https://gateway.example.com/v1",
          apiKey: "sk-test",
          maxPromptTokens: 246_144,
        },
      });

      const eventsFiber = yield* adapter.streamEvents.pipe(
        Stream.take(15),
        Stream.runCollect,
        Effect.forkChild,
      );
      yield* Effect.yieldNow;
      yield* adapter.sendTurn({
        threadId,
        input: "hello",
        attachments: [],
        modelSelection: {
          instanceId,
          model: "gpt-next",
          options: [{ id: "reasoningEffort", value: "low" }],
        },
      });
      expect(setModel).toHaveBeenCalledWith("gpt-next", {
        reasoningEffort: "low",
        modelCapabilities: {
          limits: {
            max_context_window_tokens: 100_000,
            max_prompt_tokens: 90_000,
          },
        },
      });
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "hello", agentMode: "autopilot" }),
      );
      const timestamp = "2026-08-26T00:00:00.000Z";
      const events: ReadonlyArray<SessionEvent> = [
        {
          type: "tool.execution_start",
          id: "shell-start",
          parentId: null,
          timestamp,
          data: {
            toolCallId: "shell-call",
            toolName: "shell",
            arguments: { command: "vp test run" },
            shellToolInfo: {
              displayCommand: "vp test run",
              hasWriteFileRedirection: false,
              possiblePaths: [],
            },
          },
        },
        {
          type: "tool.execution_progress",
          id: "shell-progress",
          parentId: "shell-start",
          timestamp,
          ephemeral: true,
          data: {
            toolCallId: "shell-call",
            progressMessage: "Preparing test runner",
          },
        },
        {
          type: "tool.execution_partial_result",
          id: "shell-partial",
          parentId: "shell-progress",
          timestamp,
          ephemeral: true,
          data: {
            toolCallId: "shell-call",
            partialOutput: "Running tests...",
          },
        },
        {
          type: "tool.execution_complete",
          id: "shell-complete",
          parentId: "shell-partial",
          timestamp,
          data: {
            toolCallId: "shell-call",
            success: true,
            result: {
              content: "All tests passed",
              detailedContent: "All tests passed\n25 tests completed",
            },
          },
        },
        {
          type: "tool.execution_start",
          id: "mcp-start",
          parentId: "shell-complete",
          timestamp,
          data: {
            toolCallId: "mcp-call",
            toolName: "read_file",
            mcpServerName: "filesystem",
            mcpToolName: "read_file",
            arguments: { path: "src/index.ts" },
          },
        },
        {
          type: "tool.execution_complete",
          id: "mcp-complete",
          parentId: "mcp-start",
          timestamp,
          data: {
            toolCallId: "mcp-call",
            success: true,
            result: { content: "export const ready = true;" },
          },
        },
        {
          type: "assistant.message",
          id: "assistant-event",
          parentId: "mcp-complete",
          timestamp,
          data: { messageId: "assistant-1", content: "Hello from Copilot" },
        },
        {
          type: "session.idle",
          id: "idle-event",
          parentId: "assistant-event",
          timestamp,
          ephemeral: true,
          data: {},
        },
      ];
      if (!onEvent) return yield* Effect.die("Copilot session did not register an event handler.");
      for (const event of events) onEvent(event);

      const runtimeEvents: ReadonlyArray<ProviderRuntimeEvent> = [
        ...(yield* Fiber.join(eventsFiber)),
      ];
      expect(runtimeEvents.map((event) => event.type)).toEqual([
        "turn.started",
        "session.state.changed",
        "thread.state.changed",
        "item.started",
        "item.updated",
        "item.updated",
        "item.completed",
        "item.started",
        "item.completed",
        "item.started",
        "content.delta",
        "item.completed",
        "turn.completed",
        "thread.state.changed",
        "session.state.changed",
      ]);
      expect(runtimeEvents[3]).toMatchObject({
        type: "item.started",
        payload: {
          itemType: "command_execution",
          title: "shell",
          data: { command: "vp test run", toolCallId: "shell-call" },
        },
      });
      expect(runtimeEvents[4]).toMatchObject({
        type: "item.updated",
        payload: {
          detail: "Status: Preparing test runner",
        },
      });
      expect(runtimeEvents[5]).toMatchObject({
        type: "item.updated",
        payload: {
          detail: "Output:\nRunning tests...",
          data: { rawOutput: "Running tests..." },
        },
      });
      expect(runtimeEvents[6]).toMatchObject({
        type: "item.completed",
        payload: {
          detail: "Output:\nAll tests passed\n25 tests completed",
          data: {
            command: "vp test run",
            rawOutput: {
              content: "All tests passed",
              detailedContent: "All tests passed\n25 tests completed",
            },
          },
        },
      });
      expect(runtimeEvents[8]).toMatchObject({
        type: "item.completed",
        payload: {
          itemType: "mcp_tool_call",
          data: {
            item: {
              server: "filesystem",
              tool: "read_file",
              arguments: { path: "src/index.ts" },
              result: { content: "export const ready = true;" },
            },
          },
        },
      });
      expect(runtimeEvents[10]).toMatchObject({
        type: "content.delta",
        payload: { delta: "Hello from Copilot" },
      });

      const [session] = yield* adapter.listSessions();
      expect(session).toMatchObject({
        status: "ready",
        resumeCursor: { sessionId: "copilot-session", turnCount: 1 },
      });
      expect(yield* adapter.readThread(threadId)).toMatchObject({
        turns: [{ id: expect.any(String) }],
      });

      yield* adapter.stopSession(threadId);
    }).pipe(Effect.scoped),
  );

  it.effect("finishes the turn and exposes an error state when the SDK rejects send", () =>
    Effect.gen(function* () {
      const instanceId = ProviderInstanceId.make("githubCopilot");
      const threadId = ThreadId.make("copilot-send-failure");
      const sdkSession = {
        sessionId: "copilot-session",
        send: vi.fn(() => Promise.reject(new Error("Copilot transport unavailable"))),
        abort: vi.fn(() => Promise.resolve()),
        disconnect: vi.fn(() => Promise.resolve()),
      } as unknown as CopilotSession;
      const runtime: CopilotRuntime = {
        sessionProvider: undefined,
        resolveModel: (model) => ({
          selectionModel: model,
          sdkModel: model,
          provider: undefined,
          providerId: undefined,
          configuration: undefined,
        }),
        ensureStarted: () => Promise.reject(new Error("not used by this test")),
        ping: () => Promise.reject(new Error("not used by this test")),
        getAuthStatus: () => Promise.reject(new Error("not used by this test")),
        listModels: () => Promise.resolve([]),
        createSession: () => Promise.resolve(sdkSession),
        resumeSession: () => Promise.resolve(sdkSession),
        close: () => Promise.resolve(),
      };
      const adapter = yield* makeCopilotAdapter(runtime, {
        instanceId,
        attachmentsDir: process.cwd(),
      });

      yield* adapter.startSession({
        threadId,
        provider: ProviderDriverKind.make("githubCopilot"),
        providerInstanceId: instanceId,
        cwd: process.cwd(),
        runtimeMode: "approval-required",
      });

      const eventsFiber = yield* adapter.streamEvents.pipe(
        Stream.take(7),
        Stream.runCollect,
        Effect.forkChild,
      );
      yield* Effect.yieldNow;
      const error = yield* adapter
        .sendTurn({ threadId, input: "hello", attachments: [] })
        .pipe(Effect.flip);
      const events: ReadonlyArray<ProviderRuntimeEvent> = [...(yield* Fiber.join(eventsFiber))];

      expect(error._tag).toBe("ProviderAdapterRequestError");
      expect(events.map((event) => event.type)).toEqual([
        "turn.started",
        "session.state.changed",
        "thread.state.changed",
        "runtime.error",
        "turn.completed",
        "thread.state.changed",
        "session.state.changed",
      ]);
      expect(events.at(-2)).toMatchObject({
        type: "thread.state.changed",
        payload: { state: "idle" },
      });
      expect(events.at(-1)).toMatchObject({
        type: "session.state.changed",
        payload: { state: "error" },
      });

      const [session] = yield* adapter.listSessions();
      expect(session).toMatchObject({
        status: "error",
        lastError: expect.stringContaining("Copilot transport unavailable"),
        resumeCursor: { sessionId: "copilot-session", turnCount: 1 },
      });
      expect(session).not.toHaveProperty("activeTurnId");
      const thread = yield* adapter.readThread(threadId);
      expect(thread.turns).toHaveLength(1);
      expect(thread.turns[0]?.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "runtime.error" }),
          expect.objectContaining({ type: "turn.completed" }),
        ]),
      );

      yield* adapter.stopSession(threadId);
    }).pipe(Effect.scoped),
  );

  it.effect("requires a new thread when a turn changes LLM providers", () =>
    Effect.gen(function* () {
      const instanceId = ProviderInstanceId.make("githubCopilot");
      const threadId = ThreadId.make("copilot-provider-change");
      const providerA = makeCopilotLlmModelSlug("provider-a", "model-a");
      const providerB = makeCopilotLlmModelSlug("provider-b", "model-b");
      const setModel = vi.fn(() => Promise.resolve());
      const sdkSession = {
        sessionId: "copilot-session",
        send: vi.fn(() => Promise.resolve("assistant-1")),
        setModel,
        abort: vi.fn(() => Promise.resolve()),
        disconnect: vi.fn(() => Promise.resolve()),
      } as unknown as CopilotSession;
      const runtime: CopilotRuntime = {
        sessionProvider: undefined,
        resolveModel: (model) => {
          const providerId = model === providerA ? "provider-a" : "provider-b";
          return {
            selectionModel: model,
            sdkModel: model === providerA ? "model-a" : "model-b",
            provider: {
              type: "openai",
              baseUrl: `https://${providerId}.example.com/v1`,
            },
            providerId,
            configuration: undefined,
          };
        },
        ensureStarted: () => Promise.reject(new Error("not used by this test")),
        ping: () => Promise.reject(new Error("not used by this test")),
        getAuthStatus: () => Promise.reject(new Error("not used by this test")),
        listModels: () => Promise.resolve([]),
        createSession: () => Promise.resolve(sdkSession),
        resumeSession: () => Promise.resolve(sdkSession),
        close: () => Promise.resolve(),
      };
      const adapter = yield* makeCopilotAdapter(runtime, {
        instanceId,
        attachmentsDir: process.cwd(),
      });

      yield* adapter.startSession({
        threadId,
        provider: ProviderDriverKind.make("githubCopilot"),
        providerInstanceId: instanceId,
        cwd: process.cwd(),
        runtimeMode: "approval-required",
        modelSelection: { instanceId, model: providerA },
      });
      const error = yield* adapter
        .sendTurn({
          threadId,
          input: "hello",
          attachments: [],
          modelSelection: { instanceId, model: providerB },
        })
        .pipe(Effect.flip);

      expect(error._tag).toBe("ProviderAdapterValidationError");
      if (error._tag === "ProviderAdapterValidationError") {
        expect(error.issue).toBe("Changing the Copilot LLM provider requires a new thread.");
      }
      expect(setModel).not.toHaveBeenCalled();
      yield* adapter.stopSession(threadId);
    }).pipe(Effect.scoped),
  );
});
