import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts/settings";
import { describe, expect, it } from "vite-plus/test";

import { updateMidsceneApiKey, updateMidsceneTextSetting } from "./MidsceneSettingsSection";

describe("MidsceneSettingsSection helpers", () => {
  it("preserves a stored API key marker when another setting changes", () => {
    const current = {
      ...DEFAULT_SERVER_SETTINGS.midscene,
      modelApiKeyRedacted: true,
    };

    expect(updateMidsceneTextSetting(current, "modelName", "gpt-4o")).toEqual({
      ...current,
      modelName: "gpt-4o",
    });
  });

  it("marks API key replacements and removals as explicit plaintext updates", () => {
    const current = {
      ...DEFAULT_SERVER_SETTINGS.midscene,
      modelApiKeyRedacted: true,
    };

    expect(updateMidsceneApiKey(current, "replacement-key")).toMatchObject({
      modelApiKey: "replacement-key",
      modelApiKeyRedacted: false,
    });
    expect(updateMidsceneApiKey(current, "")).toMatchObject({
      modelApiKey: "",
      modelApiKeyRedacted: false,
    });
  });
});
