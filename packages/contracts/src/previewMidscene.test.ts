import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  PreviewMidsceneActInput,
  PreviewMidsceneAssertResult,
  PreviewMidsceneConfigurationError,
  PreviewMidsceneError,
  PreviewMidsceneQueryResult,
} from "./previewMidscene.ts";

const decodeActInput = Schema.decodeUnknownSync(PreviewMidsceneActInput);
const decodeAssertResult = Schema.decodeUnknownSync(PreviewMidsceneAssertResult);
const decodeQueryResult = Schema.decodeUnknownSync(PreviewMidsceneQueryResult);
const decodeError = Schema.decodeUnknownSync(PreviewMidsceneError);

describe("PreviewMidscene contracts", () => {
  it("accepts a bounded semantic action with explicit tab targeting", () => {
    expect(
      decodeActInput({
        tabId: "preview-tab",
        instruction: "Complete the visible checkout form",
        deepThink: true,
        timeoutMs: 120_000,
      }),
    ).toMatchObject({
      tabId: "preview-tab",
      instruction: "Complete the visible checkout form",
      deepThink: true,
    });
    expect(() => decodeActInput({ instruction: " " })).toThrow();
    expect(() => decodeActInput({ instruction: "Inspect the page", timeoutMs: 300_001 })).toThrow();
  });

  it("preserves JSON query values and assertion diagnostics", () => {
    const usage = {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      cachedInputTokens: 0,
      modelTimeMs: 25,
      calls: 1,
    };
    expect(
      decodeQueryResult({ tabId: "preview-tab", value: { products: ["One"] }, usage }).value,
    ).toEqual({ products: ["One"] });
    expect(
      decodeAssertResult({
        tabId: "preview-tab",
        pass: false,
        reason: "The success state is not visible.",
        usage,
      }),
    ).toMatchObject({ pass: false, reason: "The success state is not visible." });
  });

  it("decodes actionable configuration errors", () => {
    const error = decodeError(
      new PreviewMidsceneConfigurationError({
        operation: "act",
        missingVariables: ["MIDSCENE_MODEL_API_KEY", "MIDSCENE_MODEL_FAMILY"],
      }),
    );
    expect(error._tag).toBe("PreviewMidsceneConfigurationError");
    expect(error.message).toContain("MIDSCENE_MODEL_API_KEY");
  });
});
