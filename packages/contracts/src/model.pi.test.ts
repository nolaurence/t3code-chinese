import { describe, expect, it } from "vite-plus/test";

import { ProviderDriverKind } from "./providerInstance.ts";
import { PROVIDER_DISPLAY_NAMES } from "./model.ts";

describe("Pi provider model metadata", () => {
  it("publishes the Pi display name", () => {
    expect(PROVIDER_DISPLAY_NAMES[ProviderDriverKind.make("piAgent")]).toBe("Pi");
  });
});
