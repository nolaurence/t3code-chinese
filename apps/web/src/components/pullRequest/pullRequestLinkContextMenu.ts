import type { ContextMenuItem } from "@t3tools/contracts";
import {
  type SourceControlDefinition,
  UNKNOWN_SOURCE_CONTROL_CLIENT,
} from "@t3tools/client-runtime/source-control-clients";

import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import type { Translate } from "~/i18n";
import { readLocalApi } from "~/localApi";

import { toastManager } from "../ui/toast";

export type PullRequestLinkContextMenuAction = "copy-link" | "open-external";

export const openOnHostLabel = (host: SourceControlDefinition, t?: Translate): string => {
  const label =
    host === UNKNOWN_SOURCE_CONTROL_CLIENT ? (t ? t("pullRequest.host") : "host") : host.label;
  return t
    ? t("pullRequest.openOnHost", { host: label })
    : host === UNKNOWN_SOURCE_CONTROL_CLIENT
      ? "Open on host"
      : `Open on ${host.label}`;
};

function pullRequestLinkContextMenuItems(
  openLabel: string,
  t?: Translate,
): readonly ContextMenuItem<PullRequestLinkContextMenuAction>[] {
  return [
    { id: "copy-link", label: t?.("pullRequest.copyLink") ?? "Copy link", icon: "copy" },
    { id: "open-external", label: openLabel },
  ];
}

export async function showPullRequestLinkContextMenu({
  url,
  openLabel,
  position,
  t,
}: {
  readonly url: string;
  readonly openLabel: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly t?: Translate;
}): Promise<void> {
  const api = readLocalApi();
  if (!api) return;
  let action: PullRequestLinkContextMenuAction | null = null;
  try {
    action = await api.contextMenu.show(pullRequestLinkContextMenuItems(openLabel, t), position);
  } catch {
    return;
  }
  try {
    if (action === "copy-link") await writeTextToClipboard(url, "link");
    else if (action === "open-external") await api.shell.openExternal(url);
  } catch {
    toastManager.add({
      type: "error",
      title:
        action === "copy-link"
          ? (t?.("pullRequest.copyLinkFailed") ?? "Could not copy the link")
          : (t?.("pullRequest.openLinkFailed") ?? "Could not open the link"),
    });
  }
}
