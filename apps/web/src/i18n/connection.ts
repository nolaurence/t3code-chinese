import type { EnvironmentConnectionPresentation } from "@t3tools/client-runtime/connection";

import type { Translate } from "./messages";

export function localizedConnectionStatusText(
  connection: EnvironmentConnectionPresentation,
  t: Translate,
): string {
  switch (connection.phase) {
    case "available":
      return t("connections.status.available");
    case "offline":
      return t("connections.status.offline");
    case "connecting":
      return t("connections.status.connecting");
    case "reconnecting":
      return connection.error
        ? t("connections.status.reconnectingReason", { reason: connection.error })
        : t("connections.status.reconnecting");
    case "connected":
      return t("connections.status.connected");
    case "error":
      return connection.error
        ? t("connections.status.failedReason", { reason: connection.error })
        : t("connections.status.failed");
  }
}
