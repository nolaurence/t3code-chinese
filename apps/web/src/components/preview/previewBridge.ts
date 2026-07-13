import type { DesktopPreviewBridge, PreviewAutomationFeature } from "@t3tools/contracts";

type CompatiblePreviewAutomationBridge = Pick<
  DesktopPreviewBridge["automation"],
  "supportedFeatures"
>;

export const readPreviewAutomationSupportedFeatures = (
  automation: CompatiblePreviewAutomationBridge | null | undefined,
): ReadonlyArray<PreviewAutomationFeature> => automation?.supportedFeatures ?? [];

/**
 * Module-level handle to the desktop preview bridge.
 *
 * Resolved once at import time so React hooks don't pay for repeated
 * `window.desktopBridge?.preview` lookups on every render. `null` on the web
 * build where there's no Electron host.
 */
export const previewBridge =
  typeof window === "undefined" ? null : (window.desktopBridge?.preview ?? null);
