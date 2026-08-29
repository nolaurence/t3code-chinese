import { ProviderDriverKind } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";

import { ProviderSettingsPanel } from "../components/settings/ProviderSettingsPanel";
import { useI18n } from "../i18n";

const isGitHubCopilotDriver = (driver: ProviderDriverKind) => driver === "githubCopilot";

function SettingsCopilotSdkRoute() {
  const { t } = useI18n();
  return (
    <ProviderSettingsPanel
      driverFilter={isGitHubCopilotDriver}
      title={t("copilotSdk.title")}
      searchId="copilot-sdk"
    />
  );
}

export const Route = createFileRoute("/settings/copilot-sdk")({
  component: SettingsCopilotSdkRoute,
});
