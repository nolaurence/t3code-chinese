import { expect, it } from "@effect/vitest";
import { EnvironmentId, PreviewTabId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { layerInProcessMcpServer, toolkitRegistration } from "../../McpHttpServer.ts";
import { liveThreadsLayer } from "../../McpToolAccess.testkit.ts";
import { McpSchema, McpServer } from "effect/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as PreviewMidsceneService from "../../PreviewMidsceneService.ts";
import { PreviewMidsceneToolkitHandlersLive } from "./handlers.ts";
import { PreviewMidsceneToolkit } from "./tools.ts";

const environmentId = EnvironmentId.make("environment-midscene-toolkit-test");
const threadId = ThreadId.make("thread-midscene-toolkit-test");
const tabId = PreviewTabId.make("tab-midscene-toolkit-test");
const providerInstanceId = ProviderInstanceId.make("codex");
const usage = {
  promptTokens: 10,
  completionTokens: 4,
  totalTokens: 14,
  cachedInputTokens: 0,
  modelTimeMs: 25,
  calls: 1,
};

const client = McpSchema.McpServerClient.of({
  clientId: 1,
  clientCapabilities: {},
  clientInfo: { name: "midscene-toolkit-test", version: "1.0.0" },
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "midscene-toolkit-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
});

const invocation = (capabilities: ReadonlySet<McpInvocationContext.McpCapability>) => ({
  environmentId,
  client: undefined,
  requestNamespace: "midscene-test",
  thread: {
    threadId,
    providerInstanceId,
    providerSessionId: "provider-session-midscene-toolkit-test",
  },
  capabilities,
  issuedAt: 1,
});

it.effect("requires preview capability before delegating to the Midscene service", () => {
  let callCount = 0;
  const service = PreviewMidsceneService.PreviewMidsceneService.of({
    act: () => {
      callCount += 1;
      return Effect.succeed({ tabId, output: "done", usage });
    },
    query: () => Effect.succeed({ tabId, value: null, usage }),
    assert: () => Effect.succeed({ tabId, pass: true, reason: null, usage }),
  });
  const TestLayer = toolkitRegistration(
    PreviewMidsceneToolkit,
    PreviewMidsceneToolkitHandlersLive,
  ).pipe(
    Layer.provide(liveThreadsLayer),
    Layer.provide(NodeCrypto.layer),
    Layer.provide(Layer.succeed(PreviewMidsceneService.PreviewMidsceneService, service)),
    Layer.provideMerge(layerInProcessMcpServer),
  );

  return Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const result = yield* server
      .callTool({
        name: "preview_midscene_act",
        arguments: { instruction: "Click the visible submit button" },
      })
      .pipe(
        Effect.provideService(McpInvocationContext.McpInvocationContext, invocation(new Set())),
        Effect.provideService(McpSchema.McpServerClient, client),
      );

    expect(result.isError).toBe(true);
    expect(callCount).toBe(0);
  }).pipe(Effect.provide(TestLayer));
});

it.effect("delegates act, query, and assert with the authenticated invocation scope", () => {
  const calls: Array<{
    readonly operation: "act" | "query" | "assert";
    readonly scope: McpInvocationContext.McpInvocationScope;
    readonly input: unknown;
  }> = [];
  const service = PreviewMidsceneService.PreviewMidsceneService.of({
    act: (scope, input) => {
      calls.push({ operation: "act", scope, input });
      return Effect.succeed({ tabId, output: "submitted", usage });
    },
    query: (scope, input) => {
      calls.push({ operation: "query", scope, input });
      return Effect.succeed({ tabId, value: { heading: "Welcome" }, usage });
    },
    assert: (scope, input) => {
      calls.push({ operation: "assert", scope, input });
      return Effect.succeed({ tabId, pass: false, reason: "Dialog is still visible", usage });
    },
  });
  const TestLayer = toolkitRegistration(
    PreviewMidsceneToolkit,
    PreviewMidsceneToolkitHandlersLive,
  ).pipe(
    Layer.provide(liveThreadsLayer),
    Layer.provide(NodeCrypto.layer),
    Layer.provide(Layer.succeed(PreviewMidsceneService.PreviewMidsceneService, service)),
    Layer.provideMerge(layerInProcessMcpServer),
  );

  return Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const context = invocation(new Set(["preview"]));
    const invoke = (name: string, args: Record<string, unknown>) =>
      server
        .callTool({ name, arguments: args })
        .pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, context),
          Effect.provideService(McpSchema.McpServerClient, client),
        );

    const act = yield* invoke("preview_midscene_act", {
      tabId,
      instruction: "Submit the current form",
      deepThink: true,
      timeoutMs: 30_000,
    });
    const query = yield* invoke("preview_midscene_query", {
      tabId,
      demand: "object, visible heading",
    });
    const assertion = yield* invoke("preview_midscene_assert", {
      tabId,
      assertion: "The dialog is closed",
    });

    expect(act.isError).toBe(false);
    expect(act.structuredContent).toMatchObject({ tabId, output: "submitted" });
    expect(query.structuredContent).toMatchObject({
      tabId,
      value: { heading: "Welcome" },
    });
    expect(assertion.structuredContent).toMatchObject({
      tabId,
      pass: false,
      reason: "Dialog is still visible",
    });
    expect(calls.map(({ operation }) => operation)).toEqual(["act", "query", "assert"]);
    expect(calls.every(({ scope }) => scope === context)).toBe(true);
    expect(calls[0]?.input).toEqual({
      tabId,
      instruction: "Submit the current form",
      deepThink: true,
      timeoutMs: 30_000,
    });
  }).pipe(Effect.provide(TestLayer));
});
