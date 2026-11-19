import { readLocalApi } from "~/localApi";
import type { Translate } from "~/i18n";

let pendingConfirmations = 0;

export function isTerminalCloseConfirmPending(): boolean {
  return pendingConfirmations > 0;
}

export async function confirmTerminalClose(
  labels: readonly [string, ...string[]],
  t?: Translate,
): Promise<boolean> {
  const localApi = readLocalApi();
  if (!localApi) return true;
  pendingConfirmations += 1;
  try {
    return await localApi.dialogs.confirm(
      labels.length === 1
        ? [
            t?.("terminal.closeConfirm.oneTitle", { label: labels[0] }) ??
              `Close terminal "${labels[0]}"?`,
            t?.("terminal.closeConfirm.oneDescription") ??
              "This stops the running process and clears its history.",
          ].join("\n")
        : [
            t?.("terminal.closeConfirm.manyTitle", { count: labels.length }) ??
              `Close ${labels.length} terminals?`,
            t?.("terminal.closeConfirm.manyDescription", {
              labels: labels.map((label) => `"${label}"`).join(", "),
            }) ??
              `This stops their running processes and clears their histories: ${labels
                .map((label) => `"${label}"`)
                .join(", ")}.`,
          ].join("\n"),
      { variant: "destructive" },
    );
  } catch {
    return false;
  } finally {
    pendingConfirmations -= 1;
  }
}
