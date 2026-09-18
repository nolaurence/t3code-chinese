import { useAtomValue } from "@effect/atom-react";
import { resolveEnvironmentMachineKind } from "@t3tools/contracts";
import {
  gitHubRoutingConnectionKey,
  gitHubRoutingPermissionFor,
  type GitHubRoutingPermission,
} from "@t3tools/client-runtime/connection";
import { useState } from "react";

import { environmentCatalog } from "~/connection/catalog";
import type { EnvironmentPresentation } from "~/state/environments";
import { useAtomCommand } from "~/state/use-atom-command";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";
import { EnvironmentRow, environmentTransportLabel } from "./EnvironmentRow";
import { FoldedSettingsSection } from "./FoldedSettingsSection";
import { searchableSetting } from "./settingsSearch";
import { useI18n, type Translate } from "../../i18n";

const PERMISSION_VALUES: ReadonlyArray<GitHubRoutingPermission> = ["off", "read", "read-write"];

function permissionLabel(permission: GitHubRoutingPermission, t: Translate): string {
  switch (permission) {
    case "off":
      return t("common.off");
    case "read":
      return t("settings.githubRouting.read");
    case "read-write":
      return t("settings.githubRouting.readWrite");
  }
}

function permissionSummaryLabel(
  permission: Exclude<GitHubRoutingPermission, "off">,
  t?: Translate,
): string {
  if (permission === "read-write") {
    return t ? t("settings.githubRouting.readWriteSummary") : "read and act";
  }
  return t ? t("settings.githubRouting.readSummary") : "read PRs";
}

/**
 * Closed-header summary: the machines that share, grouped by permission.
 * Null when nothing is shared.
 */
export function summarizeGitHubRouting(
  entries: ReadonlyArray<{ readonly label: string; readonly permission: GitHubRoutingPermission }>,
  t?: Translate,
): string | null {
  const groups = (["read-write", "read"] as const).flatMap((permission) => {
    const labels = entries.filter((entry) => entry.permission === permission);
    return labels.length === 0
      ? []
      : [
          `${labels.map((entry) => entry.label).join(", ")} ${permissionSummaryLabel(permission, t)}`,
        ];
  });
  return groups.length === 0 ? null : groups.join(" · ");
}

/**
 * Folded section under the environments list. One row per switched-on machine
 * with how much of its GitHub access the other machines may use. The trust
 * warning is the first line of the body so it sits next to the control.
 * Rendered only when two or more machines are on.
 */
export function GitHubRoutingSettings({
  environments,
}: {
  readonly environments: ReadonlyArray<EnvironmentPresentation>;
}) {
  const { t } = useI18n();
  const permissions = useAtomValue(environmentCatalog.githubRoutingPermissionsValueAtom);
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const update = useAtomCommand(environmentCatalog.setGitHubRoutingPermission);
  const [saving, setSaving] = useState(false);

  if (environments.length < 2) return null;

  const { id, title } = searchableSetting("github-routing", t);
  return (
    <FoldedSettingsSection
      id={id}
      title={title}
      summary={
        summarizeGitHubRouting(
          environments.map((environment) => ({
            label: environment.label,
            permission: gitHubRoutingPermissionFor(environment.entry, permissions),
          })),
          t,
        ) ?? t("common.off")
      }
    >
      <p className="px-3 py-2.5 text-xs text-muted-foreground sm:px-4">
        {t("settings.githubRouting.description")}
      </p>
      {environments.map((environment) => (
        <EnvironmentRow
          key={environment.environmentId}
          kind={resolveEnvironmentMachineKind(environment.serverConfig)}
          label={environment.label}
          subtitle={environmentTransportLabel(environment, t)}
        >
          <Select
            items={PERMISSION_VALUES.map((value) => ({
              value,
              label: permissionLabel(value, t),
            }))}
            value={gitHubRoutingPermissionFor(environment.entry, permissions)}
            disabled={
              !catalog.isReady || saving || gitHubRoutingConnectionKey(environment.entry) === null
            }
            onValueChange={(permission) => {
              if (permission === null) return;
              setSaving(true);
              void update({ environmentId: environment.environmentId, permission }).then(
                (result) => {
                  setSaving(false);
                  if (result._tag === "Failure")
                    toastManager.add({
                      type: "error",
                      title: t("settings.githubRouting.saveFailed"),
                    });
                },
              );
            }}
          >
            <SelectTrigger
              size="xs"
              className="w-32"
              aria-label={t("settings.githubRouting.aria", { environment: environment.label })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {PERMISSION_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {permissionLabel(value, t)}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </EnvironmentRow>
      ))}
    </FoldedSettingsSection>
  );
}
