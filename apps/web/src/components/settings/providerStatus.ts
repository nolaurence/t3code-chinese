import type { ServerProvider, ServerProviderVersionAdvisory } from "@t3tools/contracts";
import { createTranslator, type Translate } from "../../i18n";

const english = createTranslator("en");

/**
 * Visual treatment for each server-reported provider status. Centralized so
 * the default-driver card and per-instance cards share the same language.
 */
export const PROVIDER_STATUS_STYLES = {
  disabled: {
    dot: "bg-amber-400",
  },
  error: {
    dot: "bg-destructive",
  },
  ready: {
    dot: "bg-success",
  },
  warning: {
    dot: "bg-warning",
  },
} as const;

export type ProviderStatusKey = keyof typeof PROVIDER_STATUS_STYLES;

/**
 * Status probes can be retried when the provider binary was found but the
 * probe itself failed before authentication could be determined. This matches
 * the generic "Unavailable" presentation without showing a misleading retry
 * action for disabled, missing, or explicitly unauthenticated providers.
 */
export function canRetryProviderStatusCheck(provider: ServerProvider | undefined): boolean {
  return (
    provider?.enabled === true &&
    provider.installed &&
    provider.status === "error" &&
    provider.auth.status === "unknown"
  );
}

/**
 * Derive the headline + detail copy shown under a provider's name in the
 * settings page. Prefers `provider.message` for server-supplied detail and
 * falls back to generic phrasing when the server has not yet reported any
 * state — which happens before the first probe or when an instance names a
 * driver this build does not ship.
 */
export function getProviderSummary(provider: ServerProvider | undefined, t: Translate = english) {
  if (!provider) {
    return {
      headline: t("providers.status.checking"),
      detail: t("providers.status.checkingDetail"),
    };
  }
  if (!provider.enabled) {
    return {
      headline: t("providers.status.disabled"),
      detail: provider.message ?? t("providers.status.disabledDetail"),
    };
  }
  if (!provider.installed) {
    return {
      headline: t("providers.status.notFound"),
      detail: provider.message ?? t("providers.status.notFoundDetail"),
    };
  }
  if (provider.auth.status === "authenticated") {
    const authLabel = provider.auth.label ?? provider.auth.type;
    return {
      headline: authLabel
        ? t("providers.status.authenticatedDetail", { label: authLabel })
        : t("providers.status.authenticated"),
      detail: provider.message ?? null,
    };
  }
  if (provider.auth.status === "unauthenticated") {
    return {
      headline: t("providers.status.unauthenticated"),
      detail: provider.message ?? null,
    };
  }
  if (provider.status === "warning") {
    return {
      headline: t("providers.status.attention"),
      detail: provider.message ?? t("providers.status.attentionDetail"),
    };
  }
  if (provider.status === "error") {
    return {
      headline: t("providers.status.unavailable"),
      detail: provider.message ?? t("providers.status.unavailableDetail"),
    };
  }
  return {
    headline: t("providers.status.available"),
    detail: provider.message ?? t("providers.status.availableDetail"),
  };
}

/**
 * Normalize a version string for display. Adds the `v` prefix when the
 * driver reported a bare version (e.g. `1.2.3`) so cards render
 * consistently regardless of driver.
 */
export function getProviderVersionLabel(version: string | null | undefined) {
  if (!version) return null;
  return version.startsWith("v") ? version : `v${version}`;
}

export function getProviderVersionAdvisoryPresentation(
  advisory: ServerProviderVersionAdvisory | undefined,
  t: Translate = english,
): {
  readonly detail: string;
  readonly updateCommand: string | null;
  readonly emphasis: "normal" | "strong";
} | null {
  if (!advisory || advisory.status === "current" || advisory.status === "unknown") {
    return null;
  }

  const version = advisory.latestVersion;
  const versionLabel = getProviderVersionLabel(version);

  return {
    detail:
      advisory.message ??
      (versionLabel
        ? t("providers.status.installVersion", { version: versionLabel })
        : t("providers.status.installLatest")),
    updateCommand: advisory.updateCommand,
    emphasis: "normal" as const,
  };
}
