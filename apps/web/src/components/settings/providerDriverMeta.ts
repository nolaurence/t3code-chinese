import { OmpSettings, ProviderDriverKind } from "@t3tools/contracts";
import { providerClients as upstreamProviderClients } from "@t3tools/client-runtime/provider-clients";
import { defineProviderClient, makeProviderClientRegistry } from "@t3tools/provider-core/client";

const ompClient = defineProviderClient({
  driverKind: ProviderDriverKind.make("omp"),
  label: "Oh My Pi",
  settingsSchema: OmpSettings,
  featured: false,
  icon: {
    viewBox: "0 0 800 800",
    fill: { light: "#0F766E", dark: "#0F766E" },
    paths: [
      {
        d: "M160 0H640A160 160 0 0 1 800 160V640A160 160 0 0 1 640 800H160A160 160 0 0 1 0 640V160A160 160 0 0 1 160 0Z",
      },
      {
        d: "M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z",
        fillRule: "evenodd",
        fill: { light: "#FFFFFF", dark: "#FFFFFF" },
      },
      {
        d: "M517.36 400H634.72V634.72H517.36Z",
        fill: { light: "#FFFFFF", dark: "#FFFFFF" },
      },
    ],
  },
});

/** Upstream provider drivers, plus the fork's Oh My Pi driver. */
export const providerClients = makeProviderClientRegistry([
  ...upstreamProviderClients.definitions,
  ompClient,
]);
