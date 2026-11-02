import { resolveEnvironmentMachineKind } from "@t3tools/contracts";

import {
  useClientSettings,
  useClientSettingsHydrated,
  updateClientSettings,
} from "~/hooks/useSettings";
import type { EnvironmentPresentation } from "~/state/environments";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { EnvironmentRow, EnvironmentTransportLabel } from "./EnvironmentRow";
import { FoldedSettingsSection } from "./FoldedSettingsSection";
import { searchableSetting } from "./settingsSearch";
import { useI18n } from "../../i18n";


const PREFERENCE_VALUES = [100, 50, 25, 0] as const;

type LoadPreference = (typeof PREFERENCE_VALUES)[number];

function loadPreferenceForWeight(weight: number | undefined): LoadPreference {
  if (weight === undefined || weight === 50) return 50;
  if (weight === 0) return 0;
  return weight < 50 ? 25 : 100;
}

function preferenceLabel(
  preference: LoadPreference,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (preference) {
    case 100:
      return t("settings.loadBalancing.prefer");
    case 25:
      return t("settings.loadBalancing.lessOften");
    case 0:
      return t("settings.loadBalancing.manualOnly");
    default:
      return t("settings.loadBalancing.normal");
  }
}

function preferenceSummary(
  preference: LoadPreference,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (preference) {
    case 100:
      return t("settings.loadBalancing.preferSummary");
    case 25:
      return t("settings.loadBalancing.lessOftenSummary");
    case 0:
      return t("settings.loadBalancing.manualOnlySummary");
    default:
      return t("settings.loadBalancing.normal");
  }
}

function summarizeLoadPreferences(
  environments: ReadonlyArray<Pick<EnvironmentPresentation, "environmentId" | "label">>,
  weights: Readonly<Record<string, number>>,
  t: ReturnType<typeof useI18n>["t"],
): string | null {
  const parts = environments.flatMap((environment) => {
    const preference = loadPreferenceForWeight(weights[environment.environmentId]);
    return preference === 50 ? [] : [`${environment.label} ${preferenceSummary(preference, t)}`];
  });
  return parts.length === 0 ? null : parts.join(" · ");
}

export function LoadBalancingSettings({
  environments,
}: {
  environments: ReadonlyArray<EnvironmentPresentation>;
}) {
  const { t } = useI18n();
  const preferences = PREFERENCE_VALUES.map((value) => ({
    value,
    label: preferenceLabel(value, t),
  }));
  const settings = useClientSettings((current) => ({
    loadBalancingEnabled: current.loadBalancingEnabled,
    loadBalancingWeights: current.loadBalancingWeights,
  }));
  const settingsHydrated = useClientSettingsHydrated();

  if (environments.length < 2) return null;

  const { id, title } = searchableSetting("load-balancing", t);
  return (
    <FoldedSettingsSection
      id={id}
      title={title}
      summary={
        settings.loadBalancingEnabled
          ? summarizeLoadPreferences(environments, settings.loadBalancingWeights, t)
          : t("common.off")
      }
      control={
        <Switch
          aria-label={t("settings.loadBalancing.aria")}
          checked={settings.loadBalancingEnabled}
          disabled={!settingsHydrated}
          onCheckedChange={(loadBalancingEnabled) => updateClientSettings({ loadBalancingEnabled })}
        />
      }
    >
      <p className="px-3 py-2.5 text-xs text-muted-foreground sm:px-4">
        {t("settings.loadBalancing.description")}
      </p>
      {environments.map((environment) => (
        <EnvironmentRow
          key={environment.environmentId}
          kind={resolveEnvironmentMachineKind(environment.serverConfig)}
          label={environment.label}
          subtitle={<EnvironmentTransportLabel environment={environment} />}
        >
          <Select
            items={preferences}
            value={loadPreferenceForWeight(
              settings.loadBalancingWeights[environment.environmentId],
            )}
            disabled={!settingsHydrated || !settings.loadBalancingEnabled}
            onValueChange={(value) => {
              if (value === null) return;
              updateClientSettings({
                loadBalancingWeights: {
                  ...settings.loadBalancingWeights,
                  [environment.environmentId]: value,
                },
              });
            }}
          >
            <SelectTrigger
              size="xs"
              className="w-32"
              aria-label={t("settings.loadBalancing.preferenceAria", { environment: environment.label })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {preferences.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </EnvironmentRow>
      ))}
    </FoldedSettingsSection>
  );
}
