import { createFileRoute } from "@tanstack/react-router";
import type { ProviderDriverKind } from "@t3tools/contracts";

import { ProviderSettingsPanel } from "../components/settings/ProviderSettingsPanel";

const isGeneralProviderDriver = (driver: ProviderDriverKind) => driver !== "githubCopilot";

function SettingsProvidersRoute() {
  return <ProviderSettingsPanel driverFilter={isGeneralProviderDriver} />;
}

export const Route = createFileRoute("/settings/providers")({
  component: SettingsProvidersRoute,
});
