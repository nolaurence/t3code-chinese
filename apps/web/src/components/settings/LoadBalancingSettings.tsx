import { resolveEnvironmentMachineKind } from "@t3tools/contracts";

import {
  useClientSettings,
  useClientSettingsHydrated,
  useUpdateClientSettings,
} from "~/hooks/useSettings";
import type { EnvironmentPresentation } from "~/state/environments";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { EnvironmentRow, environmentTransportLabel } from "./EnvironmentRow";
import { FoldedSettingsSection } from "./FoldedSettingsSection";
import { searchableSetting } from "./settingsSearch";
import { useI18n, type Translate } from "../../i18n";

const PREFERENCE_VALUES = [100, 50, 25, 0] as const;

type LoadPreference = (typeof PREFERENCE_VALUES)[number];

function preferenceLabel(preference: LoadPreference, t: Translate): string {
  switch (preference) {
    case 100:
      return t("settings.loadBalancing.prefer");
    case 50:
      return t("settings.loadBalancing.normal");
    case 25:
      return t("settings.loadBalancing.lessOften");
    case 0:
      return t("settings.loadBalancing.manualOnly");
  }
}

function preferenceSummaryLabel(preference: Exclude<LoadPreference, 50>, t: Translate): string {
  switch (preference) {
    case 100:
      return t("settings.loadBalancing.preferSummary");
    case 25:
      return t("settings.loadBalancing.lessOftenSummary");
    case 0:
      return t("settings.loadBalancing.manualOnlySummary");
  }
}

/** Snaps a saved weight (older builds stored a slider value) onto the four preferences. */
export function loadPreferenceForWeight(weight: number | undefined): LoadPreference {
  if (weight === undefined || weight === 50) return 50;
  if (weight === 0) return 0;
  return weight < 50 ? 25 : 100;
}

/**
 * Closed-header summary: the machines not at Normal, so the folded section
 * still tells you what is set. Null when every machine is at the default.
 */
export function summarizeLoadPreferences(
  environments: ReadonlyArray<Pick<EnvironmentPresentation, "environmentId" | "label">>,
  weights: Readonly<Record<string, number>>,
  t?: Translate,
): string | null {
  const parts = environments.flatMap((environment) => {
    const preference = loadPreferenceForWeight(weights[environment.environmentId]);
    if (preference === 50) return [];
    const summary = t
      ? preferenceSummaryLabel(preference, t)
      : preference === 100
        ? "prefer"
        : preference === 25
          ? "less often"
          : "manual only";
    return [`${environment.label} ${summary}`];
  });
  return parts.length === 0 ? null : parts.join(" · ");
}

/**
 * Folded section under the environments list. Its switch turns balancing on
 * for this client, and the body holds one row per switched-on machine with
 * how often that machine should receive new threads. Rendered only when two
 * or more machines are on, since one machine has nothing to balance against.
 */
export function LoadBalancingSettings({
  environments,
}: {
  environments: ReadonlyArray<EnvironmentPresentation>;
}) {
  const { t } = useI18n();
  const settings = useClientSettings();
  const settingsHydrated = useClientSettingsHydrated();
  const updateSettings = useUpdateClientSettings();

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
          onCheckedChange={(loadBalancingEnabled) => updateSettings({ loadBalancingEnabled })}
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
          subtitle={environmentTransportLabel(environment, t)}
        >
          <Select
            items={PREFERENCE_VALUES.map((value) => ({
              value,
              label: preferenceLabel(value, t),
            }))}
            value={loadPreferenceForWeight(
              settings.loadBalancingWeights[environment.environmentId],
            )}
            disabled={!settingsHydrated || !settings.loadBalancingEnabled}
            onValueChange={(value) => {
              if (value === null) return;
              updateSettings({
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
              aria-label={t("settings.loadBalancing.preferenceAria", {
                environment: environment.label,
              })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {PREFERENCE_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {preferenceLabel(value, t)}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </EnvironmentRow>
      ))}
    </FoldedSettingsSection>
  );
}
