import { Schema } from "effect";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import { PreviewTabId } from "./preview.ts";
import { PreviewAutomationError } from "./previewAutomation.ts";

export const PREVIEW_MIDSCENE_RESULT_MAX_BYTES = 64 * 1024;

const PreviewMidscenePrompt = Schema.String.check(Schema.isTrimmed())
  .check(
    Schema.isNonEmpty({
      description: "Natural-language instruction for the Midscene visual browser agent.",
    }),
  )
  .check(Schema.isMaxLength(16_000));

const PreviewMidsceneTabTargetFields = {
  tabId: Schema.optional(
    PreviewTabId.annotate({
      description:
        "Exact collaborative browser tab to target. Omit to use this agent session's current tab.",
    }),
  ).annotate({
    description:
      "Exact collaborative browser tab to target. Omit to use this agent session's current tab.",
  }),
};

const PreviewMidsceneTimeoutMs = Schema.optional(
  Schema.Int.check(Schema.isGreaterThan(0)).check(Schema.isLessThanOrEqualTo(300_000)).annotate({
    description:
      "Maximum duration for the complete semantic operation in milliseconds. Defaults to 180000; maximum 300000.",
  }),
).annotate({
  description:
    "Maximum duration for the complete semantic operation in milliseconds. Defaults to 180000; maximum 300000.",
});

export const PreviewMidsceneActInput = Schema.Struct({
  ...PreviewMidsceneTabTargetFields,
  instruction: PreviewMidscenePrompt.annotate({
    description:
      "Describe the visible outcome to achieve. Prefer one focused workflow instead of unrelated tasks.",
  }),
  deepThink: Schema.optional(
    Schema.Boolean.annotate({
      description: "Use deeper Midscene planning for a complex multi-step workflow.",
    }),
  ).annotate({
    description: "Use deeper Midscene planning for a complex multi-step workflow.",
  }),
  deepLocate: Schema.optional(
    Schema.Boolean.annotate({
      description: "Use an extra visual grounding pass when precise target location is difficult.",
    }),
  ).annotate({
    description: "Use an extra visual grounding pass when precise target location is difficult.",
  }),
  timeoutMs: PreviewMidsceneTimeoutMs,
});
export type PreviewMidsceneActInput = typeof PreviewMidsceneActInput.Type;

export const PreviewMidsceneQueryInput = Schema.Struct({
  ...PreviewMidsceneTabTargetFields,
  demand: PreviewMidscenePrompt.annotate({
    description:
      "Describe the visible data to extract and its desired JSON shape, for example 'string[], product names'.",
  }),
  timeoutMs: PreviewMidsceneTimeoutMs,
});
export type PreviewMidsceneQueryInput = typeof PreviewMidsceneQueryInput.Type;

export const PreviewMidsceneAssertInput = Schema.Struct({
  ...PreviewMidsceneTabTargetFields,
  assertion: PreviewMidscenePrompt.annotate({
    description: "Describe one observable condition that should be true in the current page.",
  }),
  timeoutMs: PreviewMidsceneTimeoutMs,
});
export type PreviewMidsceneAssertInput = typeof PreviewMidsceneAssertInput.Type;

export const PreviewMidsceneUsage = Schema.Struct({
  promptTokens: Schema.Number,
  completionTokens: Schema.Number,
  totalTokens: Schema.Number,
  cachedInputTokens: Schema.Number,
  modelTimeMs: Schema.Number,
  calls: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type PreviewMidsceneUsage = typeof PreviewMidsceneUsage.Type;

export const PreviewMidsceneActResult = Schema.Struct({
  tabId: PreviewTabId,
  output: Schema.NullOr(Schema.String),
  usage: PreviewMidsceneUsage,
});
export type PreviewMidsceneActResult = typeof PreviewMidsceneActResult.Type;

export const PreviewMidsceneQueryResult = Schema.Struct({
  tabId: PreviewTabId,
  value: Schema.Unknown,
  usage: PreviewMidsceneUsage,
});
export type PreviewMidsceneQueryResult = typeof PreviewMidsceneQueryResult.Type;

export const PreviewMidsceneAssertResult = Schema.Struct({
  tabId: PreviewTabId,
  pass: Schema.Boolean,
  reason: Schema.NullOr(Schema.String),
  usage: PreviewMidsceneUsage,
});
export type PreviewMidsceneAssertResult = typeof PreviewMidsceneAssertResult.Type;

export const PreviewMidsceneOperation = Schema.Literals(["act", "query", "assert"]);
export type PreviewMidsceneOperation = typeof PreviewMidsceneOperation.Type;

export class PreviewMidsceneConfigurationError extends Schema.TaggedErrorClass<PreviewMidsceneConfigurationError>()(
  "PreviewMidsceneConfigurationError",
  {
    operation: PreviewMidsceneOperation,
    missingVariables: Schema.Array(TrimmedNonEmptyString),
  },
) {
  override get message(): string {
    return `Midscene model configuration is incomplete for ${this.operation}; configure ${this.missingVariables.join(", ")}.`;
  }
}

export class PreviewMidsceneRuntimeUnavailableError extends Schema.TaggedErrorClass<PreviewMidsceneRuntimeUnavailableError>()(
  "PreviewMidsceneRuntimeUnavailableError",
  {
    operation: PreviewMidsceneOperation,
  },
) {
  override get message(): string {
    return `The bundled Midscene runtime is unavailable for ${this.operation}.`;
  }
}

export class PreviewMidsceneExecutionError extends Schema.TaggedErrorClass<PreviewMidsceneExecutionError>()(
  "PreviewMidsceneExecutionError",
  {
    operation: PreviewMidsceneOperation,
    stage: Schema.Literals(["initialize", "observe", "execute", "serialize", "cleanup"]),
    tabId: Schema.optional(PreviewTabId),
  },
) {
  override get message(): string {
    return `Midscene ${this.operation} failed during ${this.stage}${this.tabId ? ` on preview tab ${this.tabId}` : ""}.`;
  }
}

export class PreviewMidsceneResultTooLargeError extends Schema.TaggedErrorClass<PreviewMidsceneResultTooLargeError>()(
  "PreviewMidsceneResultTooLargeError",
  {
    operation: Schema.Literal("query"),
    tabId: PreviewTabId,
    maximumBytes: Schema.Int.check(Schema.isGreaterThan(0)),
  },
) {
  override get message(): string {
    return `Midscene query produced a result larger than ${this.maximumBytes} bytes on preview tab ${this.tabId}.`;
  }
}

export const PreviewMidsceneError = Schema.Union([
  PreviewAutomationError,
  PreviewMidsceneConfigurationError,
  PreviewMidsceneRuntimeUnavailableError,
  PreviewMidsceneExecutionError,
  PreviewMidsceneResultTooLargeError,
]);
export type PreviewMidsceneError = typeof PreviewMidsceneError.Type;
