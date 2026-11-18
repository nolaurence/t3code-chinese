import { translateCurrent } from "../i18n/messages";

import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentSummaries } from "../state/presentation";
import { environmentServerConfigsAtom } from "../state/server";
import { toastManager } from "./ui/toast";

/** Tells the user why a host dropped, once per stall, when it reports one on reconnect. */
export function startHostFreezeToasts(): () => void {
  const shown = new Set<string>();
  return appAtomRegistry.subscribe(
    environmentServerConfigsAtom,
    (configs) => {
      for (const [environmentId, config] of configs) {
        const stall = config.lastEventLoopStall;
        if (stall === undefined) continue;
        const key = `${environmentId}:${stall.detectedAt}`;
        if (shown.has(key)) continue;
        shown.add(key);
        const label =
          appAtomRegistry
            .get(environmentSummaries.identitiesAtom)
            .find((identity) => identity.environmentId === environmentId)?.label ??
          config.environment.label;
        const { loadAverage, cpuCount } = stall;
        toastManager.add({
          type: "warning",
          title: translateCurrent("notifications.host.froze", {
            host: label,
            seconds: Math.round(stall.durationMs / 1000),
          }),
          description:
            loadAverage !== undefined && loadAverage > cpuCount
              ? translateCurrent("notifications.host.overloaded", {
                  load: Math.round(loadAverage),
                  cores: cpuCount,
                })
              : translateCurrent("notifications.host.busy", { host: label }),
        });
      }
    },
    { immediate: true },
  );
}
