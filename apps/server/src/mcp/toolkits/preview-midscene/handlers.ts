import * as Effect from "effect/Effect";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as PreviewMidsceneService from "../../PreviewMidsceneService.ts";
import { PreviewMidsceneToolkit } from "./tools.ts";

const handlers = {
  preview_midscene_act: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.requireMcpCapability("preview");
      const service = yield* PreviewMidsceneService.PreviewMidsceneService;
      return yield* service.act(scope, input);
    }),
  preview_midscene_query: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.requireMcpCapability("preview");
      const service = yield* PreviewMidsceneService.PreviewMidsceneService;
      return yield* service.query(scope, input);
    }),
  preview_midscene_assert: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.requireMcpCapability("preview");
      const service = yield* PreviewMidsceneService.PreviewMidsceneService;
      return yield* service.assert(scope, input);
    }),
} satisfies Parameters<typeof PreviewMidsceneToolkit.toLayer>[0];

export const PreviewMidsceneToolkitHandlersLive = PreviewMidsceneToolkit.toLayer(handlers);
