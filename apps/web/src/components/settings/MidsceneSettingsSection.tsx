import type { MidsceneSettings } from "@t3tools/contracts";

import { useI18n } from "../../i18n/I18nProvider";
import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { DraftInput } from "../ui/draft-input";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";

type MidsceneTextSetting = "modelName" | "modelFamily" | "modelBaseUrl";

export function updateMidsceneTextSetting(
  current: MidsceneSettings,
  key: MidsceneTextSetting,
  value: string,
): MidsceneSettings {
  return { ...current, [key]: value };
}

export function updateMidsceneApiKey(
  current: MidsceneSettings,
  modelApiKey: string,
): MidsceneSettings {
  return {
    ...current,
    modelApiKey,
    modelApiKeyRedacted: false,
  };
}

export function MidsceneSettingsSection() {
  const { t } = useI18n();
  const midscene = usePrimarySettings((settings) => settings.midscene);
  const updateSettings = useUpdatePrimarySettings();

  const updateMidscene = (next: MidsceneSettings) => {
    updateSettings({ midscene: next });
  };
  const textInput = (key: MidsceneTextSetting, value: string) => (
    <DraftInput
      className="w-full sm:w-72"
      value={value}
      onCommit={(next) => updateMidscene(updateMidsceneTextSetting(midscene, key, next))}
      spellCheck={false}
      aria-label={
        key === "modelName"
          ? t("settings.midscene.modelName.title")
          : key === "modelFamily"
            ? t("settings.midscene.modelFamily.title")
            : t("settings.midscene.baseUrl.title")
      }
    />
  );

  return (
    <SettingsSection title={t("settings.midscene.title")}>
      <SettingsRow
        title={t("settings.midscene.apiKey.title")}
        description={t("settings.midscene.apiKey.description")}
        status={midscene.modelApiKeyRedacted ? t("settings.midscene.apiKey.stored") : undefined}
        resetAction={
          midscene.modelApiKeyRedacted || midscene.modelApiKey.length > 0 ? (
            <SettingResetButton
              label={t("settings.midscene.apiKey.title")}
              onClick={() => updateMidscene(updateMidsceneApiKey(midscene, ""))}
            />
          ) : null
        }
        control={
          <DraftInput
            className="w-full sm:w-72"
            type="password"
            autoComplete="off"
            value={midscene.modelApiKeyRedacted ? "" : midscene.modelApiKey}
            onCommit={(next) => updateMidscene(updateMidsceneApiKey(midscene, next))}
            placeholder={
              midscene.modelApiKeyRedacted ? t("settings.midscene.apiKey.stored") : undefined
            }
            spellCheck={false}
            aria-label={t("settings.midscene.apiKey.title")}
          />
        }
      />
      <SettingsRow
        title={t("settings.midscene.modelName.title")}
        description={t("settings.midscene.modelName.description")}
        control={textInput("modelName", midscene.modelName)}
      />
      <SettingsRow
        title={t("settings.midscene.modelFamily.title")}
        description={t("settings.midscene.modelFamily.description")}
        control={textInput("modelFamily", midscene.modelFamily)}
      />
      <SettingsRow
        title={t("settings.midscene.baseUrl.title")}
        description={t("settings.midscene.baseUrl.description")}
        control={textInput("modelBaseUrl", midscene.modelBaseUrl)}
      />
    </SettingsSection>
  );
}
