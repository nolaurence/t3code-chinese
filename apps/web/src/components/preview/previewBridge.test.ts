import { describe, expect, it } from "vite-plus/test";

import { readPreviewAutomationSupportedFeatures } from "./previewBridge";

describe("readPreviewAutomationSupportedFeatures", () => {
  it("uses the native bridge features and treats an older bridge as featureless", () => {
    expect(
      readPreviewAutomationSupportedFeatures({
        supportedFeatures: ["coordinateScrollWheel"],
      }),
    ).toEqual(["coordinateScrollWheel"]);
    expect(readPreviewAutomationSupportedFeatures({})).toEqual([]);
    expect(readPreviewAutomationSupportedFeatures(undefined)).toEqual([]);
  });
});
