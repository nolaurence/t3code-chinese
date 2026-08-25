import {
  PreviewMidsceneActInput,
  PreviewMidsceneActResult,
  PreviewMidsceneAssertInput,
  PreviewMidsceneAssertResult,
  PreviewMidsceneError,
  PreviewMidsceneQueryInput,
  PreviewMidsceneQueryResult,
} from "@t3tools/contracts";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as PreviewMidsceneService from "../../PreviewMidsceneService.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  PreviewMidsceneService.PreviewMidsceneService,
];

const semanticBrowserTool = <T extends Tool.Any>(tool: T): T =>
  tool.annotate(Tool.OpenWorld, true) as T;

const readonlySemanticBrowserTool = <T extends Tool.Any>(tool: T): T =>
  semanticBrowserTool(tool)
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true) as T;

export const PreviewMidsceneActTool = semanticBrowserTool(
  Tool.make("preview_midscene_act", {
    description:
      "Use Midscene visual reasoning to complete one semantic workflow in the built-in browser. Prefer deterministic preview tools when a reliable locator is already available. This sends current preview screenshots to the configured Midscene model provider.",
    parameters: PreviewMidsceneActInput,
    success: PreviewMidsceneActResult,
    failure: PreviewMidsceneError,
    dependencies,
  })
    .annotate(Tool.Title, "Act on preview with Midscene")
    .annotate(Tool.Readonly, false)
    .annotate(Tool.Destructive, true)
    .annotate(Tool.Idempotent, false),
);

export const PreviewMidsceneQueryTool = readonlySemanticBrowserTool(
  Tool.make("preview_midscene_query", {
    description:
      "Use Midscene visual reasoning to extract structured information from the currently visible built-in browser page without changing it. This sends current preview screenshots to the configured Midscene model provider.",
    parameters: PreviewMidsceneQueryInput,
    success: PreviewMidsceneQueryResult,
    failure: PreviewMidsceneError,
    dependencies,
  }).annotate(Tool.Title, "Query preview with Midscene"),
);

export const PreviewMidsceneAssertTool = readonlySemanticBrowserTool(
  Tool.make("preview_midscene_assert", {
    description:
      "Use Midscene visual reasoning to verify one observable condition in the currently visible built-in browser page without changing it. This sends current preview screenshots to the configured Midscene model provider.",
    parameters: PreviewMidsceneAssertInput,
    success: PreviewMidsceneAssertResult,
    failure: PreviewMidsceneError,
    dependencies,
  }).annotate(Tool.Title, "Assert preview with Midscene"),
);

export const PreviewMidsceneToolkit = Toolkit.make(
  PreviewMidsceneActTool,
  PreviewMidsceneQueryTool,
  PreviewMidsceneAssertTool,
);
