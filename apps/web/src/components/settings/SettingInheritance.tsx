import {
  DEFAULT_SERVER_SETTINGS,
  resolveEnvironmentMachineKind,
  type ServerSettings,
} from "@t3tools/contracts";
import { CheckIcon, LayersIcon } from "lucide-react";
import * as Equal from "effect/Equal";

import { useI18n, type Translate } from "../../i18n";
import { cn } from "../../lib/utils";
import type { EnvironmentPresentation } from "../../state/environments";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { resolveEnvModeLabel } from "../BranchToolbar.logic";
import { PULL_REQUEST_MERGE_METHOD_LABELS } from "../pullRequest/pullRequestDetail.logic";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { ProjectOverrideEntry, ScopedSettingsTarget } from "./scopedSettings";
import { isProjectScopedSettingKey } from "./scopedSettings";

interface InheritanceLayer {
  readonly key: "project" | "environment" | "built-in";
  readonly label: string;
  readonly value: string;
  readonly effective: boolean;
  readonly set: boolean;
}

function writingStyleLabel(mode: string, t?: Translate): string {
  switch (mode) {
    case "repo_conventions":
      return t?.("settings.inheritance.repoConventions") ?? "Repository conventions";
    case "conventional_commits":
      return t?.("settings.inheritance.conventionalCommits") ?? "Conventional Commits";
    case "custom":
      return t?.("settings.inheritance.customInstructions") ?? "Custom instructions";
    default:
      return mode;
  }
}

function mergeMethodLabel(value: string, t?: Translate): string | null {
  if (value === "merge")
    return t?.("settings.mergeMethod.merge") ?? PULL_REQUEST_MERGE_METHOD_LABELS.merge;
  if (value === "squash")
    return t?.("settings.mergeMethod.squash") ?? PULL_REQUEST_MERGE_METHOD_LABELS.squash;
  if (value === "rebase")
    return t?.("settings.mergeMethod.rebase") ?? PULL_REQUEST_MERGE_METHOD_LABELS.rebase;
  return null;
}

/** Human labels for the values the chain can show; falls back to a type summary. */
function formatValue(key: keyof ServerSettings, value: unknown, t?: Translate): string {
  if (value === null || value === undefined) {
    return key === "pullRequestMergeMethod"
      ? (t?.("settings.inheritance.lastSelected") ?? "Last selected")
      : key === "sidebarAutoSettleAfterDays"
        ? (t?.("settings.inheritance.never") ?? "Never")
        : key === "defaultModelSelection"
          ? (t?.("settings.inheritance.automatic") ?? "Automatic")
          : key === "sourceControlWriterModelSelection"
            ? (t?.("settings.inheritance.textGenerationModel") ?? "Text generation model")
            : (t?.("settings.inheritance.notSet") ?? "Not set");
  }
  if (typeof value === "boolean")
    return value
      ? (t?.("settings.inheritance.on") ?? "On")
      : (t?.("settings.inheritance.off") ?? "Off");
  if (typeof value === "number") {
    return key === "sidebarAutoSettleAfterDays"
      ? value === 1
        ? (t?.("settings.inheritance.day", { count: value }) ?? `${value} day`)
        : (t?.("settings.inheritance.days", { count: value }) ?? `${value} days`)
      : String(value);
  }
  if (typeof value === "string") {
    if (key === "defaultThreadEnvMode" && (value === "local" || value === "worktree")) {
      return value === "worktree"
        ? (t?.("branch.mode.newWorktree") ?? resolveEnvModeLabel(value))
        : (t?.("branch.mode.currentCheckout") ?? resolveEnvModeLabel(value));
    }
    const mergeLabel = mergeMethodLabel(value, t);
    if (key === "pullRequestMergeMethod" && mergeLabel) return mergeLabel;
    return value === "" ? (t?.("settings.inheritance.empty") ?? "Empty") : value;
  }
  if (Array.isArray(value))
    return value.length === 1
      ? (t?.("settings.inheritance.item", { count: value.length }) ?? `${value.length} item`)
      : (t?.("settings.inheritance.items", { count: value.length }) ?? `${value.length} items`);
  if (typeof value === "object") {
    if ("model" in value && typeof value.model === "string") return value.model;
    if ("mode" in value && typeof value.mode === "string") {
      return writingStyleLabel(value.mode, t);
    }
  }
  return t?.("settings.inheritance.custom") ?? "Custom";
}

/**
 * The layers a setting resolves through for one target, top-down: the
 * project override when the target is a project, the environment's value,
 * and the built-in default. The first layer that is set wins.
 */
export function settingInheritanceLayers(
  target: ScopedSettingsTarget,
  environmentSettings: ServerSettings,
  key: keyof ServerSettings,
  t?: Translate,
): readonly InheritanceLayer[] {
  const builtIn = DEFAULT_SERVER_SETTINGS[key];
  const environmentValue = environmentSettings[key];
  const projectSource = isProjectScopedSettingKey(key) ? target.sources[key] : "environment";
  const environmentSet = !Equal.equals(environmentValue, builtIn);
  const inherits = t?.("settings.inheritance.inherits") ?? "Inherits";
  const layers: InheritanceLayer[] = [];
  if (target.projectId !== null && isProjectScopedSettingKey(key)) {
    layers.push({
      key: "project",
      label: t?.("settings.inheritance.project") ?? "Project",
      value: projectSource === "project" ? formatValue(key, target.settings[key], t) : inherits,
      effective: projectSource === "project",
      set: projectSource === "project",
    });
  }
  layers.push({
    key: "environment",
    label: target.label,
    value: environmentSet ? formatValue(key, environmentValue, t) : inherits,
    effective: projectSource !== "project" && environmentSet,
    set: environmentSet,
  });
  layers.push({
    key: "built-in",
    label: t?.("settings.inheritance.defaultLayer") ?? "Default",
    value: formatValue(key, builtIn, t),
    effective: projectSource !== "project" && !environmentSet,
    set: true,
  });
  return layers;
}

export type SettingInheritanceState =
  | "default"
  | "environment"
  | "inherited"
  | "overridden"
  | "mixed";

/**
 * A small indicator beside a row's title that opens a top-down view of where
 * the setting's value comes from on each selected target. It sits inline so
 * narrowing to a project does not add a caption line to every row.
 */
export interface SettingOverridingProject extends ProjectOverrideEntry {
  readonly label: string;
  /** Jumps the breadcrumb to this project so its override can be edited. */
  readonly open: () => void;
}

export function SettingInheritance({
  state,
  summary,
  targets,
  environments,
  keys,
  overridingProjects = [],
  onClearOverrides,
}: {
  state: SettingInheritanceState;
  summary: string;
  targets: readonly ScopedSettingsTarget[];
  environments: readonly Pick<EnvironmentPresentation, "environmentId" | "serverConfig">[];
  keys: readonly (keyof ServerSettings)[];
  /** At environment scope: projects whose own value hides the environment's. */
  overridingProjects?: readonly SettingOverridingProject[];
  onClearOverrides?: (entries: readonly ProjectOverrideEntry[]) => void;
}) {
  const { t } = useI18n();
  const key = keys[0];
  if (!key || targets.length === 0) return null;
  const overrideSummary =
    overridingProjects.length > 0
      ? t(
          overridingProjects.length === 1
            ? "settings.inheritance.overrideCount"
            : "settings.inheritance.overrideCountPlural",
          { summary, count: overridingProjects.length },
        )
      : summary;
  const chains = targets.flatMap((target) => {
    const environment = environments.find(
      (candidate) => candidate.environmentId === target.environmentId,
    );
    if (!environment?.serverConfig) return [];
    return [
      {
        target,
        environment: { ...environment, serverConfig: environment.serverConfig },
        machine: resolveEnvironmentMachineKind(environment.serverConfig),
        layers: settingInheritanceLayers(target, environment.serverConfig.settings, key, t),
      },
    ];
  });
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  size="icon-micro"
                  variant="ghost-muted"
                  aria-label={t("settings.inheritance.showSource", { summary: overrideSummary })}
                  className={cn(
                    "[--control-icon-color:currentColor]",
                    state === "overridden"
                      ? "text-primary hover:text-primary"
                      : state === "mixed"
                        ? "text-warning hover:text-warning"
                        : state === "environment"
                          ? "text-foreground/70 hover:text-foreground"
                          : "text-muted-foreground/60 hover:text-foreground",
                  )}
                />
              }
            />
          }
        >
          <LayersIcon className="size-3" />
        </TooltipTrigger>
        <TooltipPopup side="top">{overrideSummary}</TooltipPopup>
      </Tooltip>
      <PopoverPopup
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)]"
        viewportClassName="p-0 [--viewport-inline-padding:0px]"
      >
        <div className="divide-y divide-border/60">
          {chains.map(({ target, environment, machine, layers }) => (
            <section
              key={`${target.environmentId}:${target.projectId ?? ""}`}
              className="px-3 py-2.5"
            >
              <h4 className="flex items-center gap-1.5 pb-1.5 text-xs font-medium text-muted-foreground">
                <EnvironmentMachineIcon aria-hidden kind={machine} className="size-3.5 shrink-0" />
                <span className="min-w-0 truncate">{target.label}</span>
              </h4>
              <ol role="list" className="text-sm">
                {layers.map((layer) => (
                  <li
                    key={layer.key}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2 py-1",
                      layer.effective && "bg-foreground/[0.06]",
                    )}
                  >
                    <span
                      className={cn(
                        "min-w-0 truncate",
                        layer.effective ? "font-medium text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {layer.key === "environment"
                        ? t("settings.inheritance.environmentLayer")
                        : layer.label}
                    </span>
                    <span
                      className={cn(
                        "flex items-center gap-1.5 tabular-nums",
                        layer.effective
                          ? "text-foreground"
                          : layer.set
                            ? "text-muted-foreground"
                            : "text-muted-foreground/60",
                      )}
                    >
                      <span className="max-w-32 truncate">{layer.value}</span>
                      {layer.effective ? (
                        <CheckIcon aria-hidden className="size-3.5 shrink-0 text-primary" />
                      ) : (
                        <span aria-hidden className="size-3.5 shrink-0" />
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              {(() => {
                const overriding = overridingProjects.filter(
                  (project) => project.environmentId === target.environmentId,
                );
                if (overriding.length === 0) return null;
                const overrides = environment.serverConfig.settings.projectSettingsOverrides;
                return (
                  <div className="mt-2 border-t border-border/60 pt-2">
                    <div className="flex items-center justify-between gap-3 px-2 text-xs text-muted-foreground">
                      <span>{t("settings.inheritance.overriddenBy")}</span>
                      {onClearOverrides ? (
                        <button
                          type="button"
                          className="cursor-pointer font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => onClearOverrides(overriding)}
                        >
                          {overriding.length === 1
                            ? t("settings.inheritance.resetIt")
                            : t("settings.inheritance.resetAll")}
                        </button>
                      ) : null}
                    </div>
                    <ul role="list" className="mt-0.5 text-sm">
                      {overriding.map((project) => (
                        <li
                          key={project.projectId}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-2 py-1"
                        >
                          <button
                            type="button"
                            className="min-w-0 cursor-pointer truncate text-left text-foreground underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={project.open}
                          >
                            {project.label}
                          </button>
                          <span className="max-w-32 truncate text-muted-foreground tabular-nums">
                            {isProjectScopedSettingKey(key)
                              ? formatValue(key, overrides[project.projectId]?.[key], t)
                              : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
            </section>
          ))}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
