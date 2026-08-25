import { describe, expect, it } from "vite-plus/test";

import { shouldBundleSandboxedPreloadDependency } from "./DesktopPreloadBundling.ts";

describe("shouldBundleSandboxedPreloadDependency", () => {
  it.each([
    "@t3tools/contracts",
    "@t3tools/contracts/preview-automation-features",
    "@clerk/electron",
    "@clerk/electron/preload",
  ])("bundles %s", (id) => {
    expect(shouldBundleSandboxedPreloadDependency(id)).toBe(true);
  });

  it.each(["electron", "@clerk/react", "react"])("leaves %s external", (id) => {
    expect(shouldBundleSandboxedPreloadDependency(id)).toBe(false);
  });
});
