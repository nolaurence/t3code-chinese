import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpServer } from "effect/unstable/ai";

import * as McpHttpServer from "../../McpHttpServer.ts";
import * as PreviewAutomationBroker from "../../PreviewAutomationBroker.ts";
import * as ServerSettings from "../../../serverSettings.ts";

const TestLayer = McpHttpServer.PreviewToolkitRegistrationLive.pipe(
  Layer.provideMerge(McpServer.McpServer.layer),
  Layer.provideMerge(PreviewAutomationBroker.layer.pipe(Layer.provide(NodeServices.layer))),
  Layer.provide(ServerSettings.layerTest()),
);

it.effect("registers all Midscene tools in the shared preview MCP server", () =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const registered = new Map(server.tools.map(({ tool }) => [tool.name, tool.annotations]));

    expect(registered.has("preview_midscene_act")).toBe(true);
    expect(registered.has("preview_midscene_query")).toBe(true);
    expect(registered.has("preview_midscene_assert")).toBe(true);
    expect(registered.get("preview_midscene_act")?.destructiveHint).toBe(true);
    expect(registered.get("preview_midscene_query")?.readOnlyHint).toBe(true);
    expect(registered.get("preview_midscene_assert")?.idempotentHint).toBe(true);
  }).pipe(Effect.provide(TestLayer)),
);
