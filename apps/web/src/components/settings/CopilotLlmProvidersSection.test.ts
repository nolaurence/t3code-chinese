import { describe, expect, it } from "vite-plus/test";

import { mergeDiscoveredModelDrafts } from "./CopilotLlmProvidersSection";

const draft = (id: string, overrides: Record<string, unknown> = {}) => ({
  key: `key-${id || "blank"}`,
  id,
  displayName: "",
  contextWindowTokens: "",
  reasoningEfforts: [],
  defaultReasoningEffort: "" as const,
  ...overrides,
});

describe("mergeDiscoveredModelDrafts", () => {
  it("imports API models while preserving existing overrides and manual models", () => {
    const merged = mergeDiscoveredModelDrafts(
      [
        draft("gpt-existing", { displayName: "My GPT" }),
        draft("manual-only", { contextWindowTokens: "64000" }),
        draft(""),
      ],
      [
        {
          id: "gpt-existing",
          displayName: "GPT from API",
          contextWindowTokens: 200_000,
          reasoningEfforts: ["low", "high"],
          defaultReasoningEffort: "high",
        },
        { id: "gpt-new", contextWindowTokens: 128_000 },
      ],
    );

    expect(merged.map((model) => model.id)).toEqual(["gpt-existing", "gpt-new", "manual-only"]);
    expect(merged[0]).toMatchObject({
      displayName: "My GPT",
      contextWindowTokens: "200000",
      reasoningEfforts: ["low", "high"],
      defaultReasoningEffort: "high",
    });
    expect(merged[1]).toMatchObject({
      id: "gpt-new",
      contextWindowTokens: "128000",
    });
  });
});
