import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { PiAgentIcon } from "./components/Icons";
import {
  AVAILABLE_PROVIDER_OPTIONS,
  PROVIDER_ICON_BY_PROVIDER,
} from "./components/chat/providerIconUtils";
import { getDefaultServerModel } from "./providerModels";

const PI = ProviderDriverKind.make("piAgent");

describe("Pi provider model presentation", () => {
  it("lists Pi as an available provider with its native icon", () => {
    expect(AVAILABLE_PROVIDER_OPTIONS.map((option) => option.value)).toContain(PI);
    expect(PROVIDER_ICON_BY_PROVIDER[PI]).toBe(PiAgentIcon);
  });

  it("uses the first model discovered by the Pi RPC snapshot", () => {
    const provider = {
      instanceId: ProviderInstanceId.make("piAgent"),
      driver: PI,
      enabled: true,
      models: [
        {
          slug: "openai/gpt-5.4",
          name: "GPT-5.4",
          isCustom: false,
          capabilities: { optionDescriptors: [] },
        },
      ],
    } as unknown as ServerProvider;

    expect(getDefaultServerModel([provider], PI)).toBe("openai/gpt-5.4");
  });
});
