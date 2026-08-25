import { ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveBrowsedInstanceModel } from "./ModelPickerContent";

const OPENCODE = ProviderInstanceId.make("opencode");
const PI_AGENT = ProviderInstanceId.make("piAgent");

describe("resolveBrowsedInstanceModel", () => {
  const modelOptionsByInstance = new Map([
    [OPENCODE, [{ slug: "openai/gpt-5.6-sol", name: "GPT-5.6 Sol" }]],
    [
      PI_AGENT,
      [
        { slug: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash" },
        { slug: "openai/gpt-5", name: "GPT-5" },
      ],
    ],
  ]);

  it("commits the Pi default model when browsing from OpenCode", () => {
    expect(
      resolveBrowsedInstanceModel({
        activeInstanceId: OPENCODE,
        activeModel: "openai/gpt-5.6-sol",
        nextInstanceId: PI_AGENT,
        modelOptionsByInstance,
      }),
    ).toBe("deepseek/deepseek-v4-flash");
  });

  it("does not rewrite the already-active instance", () => {
    expect(
      resolveBrowsedInstanceModel({
        activeInstanceId: PI_AGENT,
        activeModel: "openai/gpt-5",
        nextInstanceId: PI_AGENT,
        modelOptionsByInstance,
      }),
    ).toBeNull();
  });
});
