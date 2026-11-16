import * as Effect from "effect/Effect";

import * as McpToolAccess from "../../McpToolAccess.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as PreviewMidsceneService from "../../PreviewMidsceneService.ts";
import { PreviewMidsceneToolkit } from "./tools.ts";

const handlers = {
  preview_midscene_act: Effect.fn("preview_midscene_act")(function* (input) {
    const scope = yield* McpInvocationContext.requireThreadMcpCapability("preview");
    const service = yield* PreviewMidsceneService.PreviewMidsceneService;
    return yield* service.act(scope, input);
  }),
  preview_midscene_query: Effect.fn("preview_midscene_query")(function* (input) {
    const scope = yield* McpInvocationContext.requireThreadMcpCapability("preview");
    const service = yield* PreviewMidsceneService.PreviewMidsceneService;
    return yield* service.query(scope, input);
  }),
  preview_midscene_assert: Effect.fn("preview_midscene_assert")(function* (input) {
    const scope = yield* McpInvocationContext.requireThreadMcpCapability("preview");
    const service = yield* PreviewMidsceneService.PreviewMidsceneService;
    return yield* service.assert(scope, input);
  }),
} satisfies Parameters<typeof PreviewMidsceneToolkit.toLayer>[0];

export const PreviewMidsceneToolkitHandlersLive = McpToolAccess.toLayer(PreviewMidsceneToolkit, {
  preview_midscene_act: McpToolAccess.actsAsCaller(handlers.preview_midscene_act),
  preview_midscene_query: McpToolAccess.readsAsCaller(handlers.preview_midscene_query),
  preview_midscene_assert: McpToolAccess.readsAsCaller(handlers.preview_midscene_assert),
});
