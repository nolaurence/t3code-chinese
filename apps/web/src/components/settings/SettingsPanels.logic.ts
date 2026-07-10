import type {
  ProviderDriverKind,
  ProviderInstanceConfig,
  ProviderInstanceId,
  ServerSettings,
  UnifiedSettings,
} from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { createTranslator, type Translate } from "../../i18n/messages";

const DEFAULT_TRANSLATE = createTranslator("en");

export function getThemeOptions(t: Translate) {
  return [
    { value: "system", label: t("settings.theme.system") },
    { value: "light", label: t("settings.theme.light") },
    { value: "dark", label: t("settings.theme.dark") },
  ] as const;
}

export function getTimestampFormatLabels(t: Translate) {
  return {
    locale: t("settings.time.system"),
    "12-hour": t("settings.time.12Hour"),
    "24-hour": t("settings.time.24Hour"),
  } as const;
}

function collapseOtelSignalsUrl(input: {
  readonly tracesUrl: string;
  readonly metricsUrl: string;
}): string | null {
  const tracesSuffix = "/traces";
  const metricsSuffix = "/metrics";
  if (!input.tracesUrl.endsWith(tracesSuffix) || !input.metricsUrl.endsWith(metricsSuffix)) {
    return null;
  }

  const tracesBase = input.tracesUrl.slice(0, -tracesSuffix.length);
  const metricsBase = input.metricsUrl.slice(0, -metricsSuffix.length);
  if (tracesBase !== metricsBase) {
    return null;
  }

  return `${tracesBase}/{traces,metrics}`;
}

export function formatDiagnosticsDescription(
  input: {
    readonly localTracingEnabled: boolean;
    readonly otlpTracesEnabled: boolean;
    readonly otlpTracesUrl?: string | undefined;
    readonly otlpMetricsEnabled: boolean;
    readonly otlpMetricsUrl?: string | undefined;
  },
  t: Translate = DEFAULT_TRANSLATE,
): string {
  const mode = input.localTracingEnabled
    ? t("settings.diagnostics.localTrace")
    : t("settings.diagnostics.terminalLogs");
  const tracesUrl = input.otlpTracesEnabled ? input.otlpTracesUrl : undefined;
  const metricsUrl = input.otlpMetricsEnabled ? input.otlpMetricsUrl : undefined;

  if (tracesUrl && metricsUrl) {
    const collapsedUrl = collapseOtelSignalsUrl({ tracesUrl, metricsUrl });
    return collapsedUrl
      ? t("settings.diagnostics.exportCombined", { mode, url: collapsedUrl })
      : t("settings.diagnostics.exportSeparate", { mode, tracesUrl, metricsUrl });
  }

  if (tracesUrl) {
    return t("settings.diagnostics.exportTraces", { mode, url: tracesUrl });
  }

  if (metricsUrl) {
    return t("settings.diagnostics.exportMetrics", { mode, url: metricsUrl });
  }

  return t("settings.diagnostics.modeOnly", { mode });
}

export function buildProviderInstanceUpdatePatch(input: {
  readonly settings: Pick<ServerSettings, "providers" | "providerInstances">;
  readonly instanceId: ProviderInstanceId;
  readonly instance: ProviderInstanceConfig;
  readonly driver: ProviderDriverKind;
  readonly isDefault: boolean;
  readonly textGenerationModelSelection?:
    | ServerSettings["textGenerationModelSelection"]
    | undefined;
}): Partial<UnifiedSettings> {
  type LegacyProviderSettings = ServerSettings["providers"][keyof ServerSettings["providers"]];
  const legacyProviderDefaults = DEFAULT_UNIFIED_SETTINGS.providers as Record<
    string,
    LegacyProviderSettings | undefined
  >;
  const legacyProviderDefault = input.isDefault ? legacyProviderDefaults[input.driver] : undefined;
  return {
    ...(legacyProviderDefault !== undefined
      ? {
          providers: {
            ...input.settings.providers,
            [input.driver]: legacyProviderDefault,
          } as ServerSettings["providers"],
        }
      : {}),
    providerInstances: {
      ...input.settings.providerInstances,
      [input.instanceId]: input.instance,
    },
    ...(input.textGenerationModelSelection !== undefined
      ? { textGenerationModelSelection: input.textGenerationModelSelection }
      : {}),
  };
}
