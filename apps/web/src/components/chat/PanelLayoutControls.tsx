import {
  ArrowLeftRightIcon,
  Maximize2Icon,
  Minimize2Icon,
  PanelBottomIcon,
  PanelLeftIcon,
  PanelRightIcon,
} from "lucide-react";
import { memo } from "react";

import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useI18n } from "~/i18n";
import type { RightPanelSide } from "../preview/rightPanelSide";

interface PanelLayoutControlsProps {
  showTerminalControl?: boolean;
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalShortcutLabel: string | null;
  rightPanelAvailable: boolean;
  rightPanelOpen: boolean;
  rightPanelShortcutLabel: string | null;
  rightPanelUnavailableLabel?: string;
  /** Running + waiting subagents in this thread; badges the right panel toggle. */
  liveAgentCount: number;
  /** Which side the panel docks to; flips the toggle icon. */
  rightPanelSide?: RightPanelSide;
  /** Swap-button visibility; the sheet layout overlays the panel, so it has no side. */
  showPanelSideSwap?: boolean;
  onToggleTerminal: () => void;
  onToggleRightPanel: () => void;
  onToggleRightPanelSide?: () => void;
}

export const PanelLayoutControls = memo(function PanelLayoutControls({
  showTerminalControl = true,
  terminalAvailable,
  terminalOpen,
  terminalShortcutLabel,
  rightPanelAvailable,
  rightPanelOpen,
  rightPanelShortcutLabel,
  rightPanelUnavailableLabel,
  liveAgentCount,
  rightPanelSide = "right",
  showPanelSideSwap = false,
  onToggleTerminal,
  onToggleRightPanel,
  onToggleRightPanelSide,
}: PanelLayoutControlsProps) {
  const { t } = useI18n();
  const resolvedRightPanelUnavailableLabel =
    rightPanelUnavailableLabel ?? t("chat.panel.rightUnavailable");
  const agentsWorkingLabel = t(
    liveAgentCount === 1 ? "chat.panel.agentWorking" : "chat.panel.agentsWorking",
    { count: liveAgentCount },
  );
  const sideSwapLabel =
    rightPanelSide === "right" ? t("chat.panel.moveToLeft") : t("chat.panel.moveToRight");
  return (
    <div
      className="flex h-full shrink-0 items-center gap-1 [-webkit-app-region:no-drag]"
      data-panel-layout-controls
    >
      {showTerminalControl ? (
        <Tooltip>
          <TooltipTrigger render={<span className="flex shrink-0" />}>
            <Toggle
              className="shrink-0 [-webkit-app-region:no-drag]"
              pressed={terminalOpen}
              onPressedChange={onToggleTerminal}
              aria-label={t("chat.panel.toggleTerminal")}
              variant="ghost"
              size="sm"
              disabled={!terminalAvailable}
            >
              <PanelBottomIcon className="size-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {terminalAvailable
              ? `${t("chat.panel.toggleTerminal")}${terminalShortcutLabel ? ` (${terminalShortcutLabel})` : ""}`
              : t("chat.panel.terminalUnavailable")}
          </TooltipPopup>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger render={<span className="flex shrink-0" />}>
          <Toggle
            className="shrink-0 [-webkit-app-region:no-drag]"
            pressed={rightPanelOpen}
            onPressedChange={onToggleRightPanel}
            aria-label={
              liveAgentCount > 0
                ? `${t("chat.panel.toggleRight")}, ${agentsWorkingLabel}`
                : t("chat.panel.toggleRight")
            }
            variant="ghost"
            size="sm"
            disabled={!rightPanelAvailable}
          >
            {rightPanelSide === "left" ? (
              <PanelLeftIcon className="size-4" />
            ) : (
              <PanelRightIcon className="size-4" />
            )}
            {liveAgentCount > 0 ? (
              <span
                aria-hidden
                className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-info px-1 text-3xs font-semibold tabular-nums text-white"
              >
                {liveAgentCount}
              </span>
            ) : null}
          </Toggle>
        </TooltipTrigger>
        <TooltipPopup side="bottom">
          {rightPanelAvailable
            ? `${t("chat.panel.toggleRight")}${rightPanelShortcutLabel ? ` (${rightPanelShortcutLabel})` : ""}${
                liveAgentCount > 0 ? ` · ${agentsWorkingLabel}` : ""
              }`
            : resolvedRightPanelUnavailableLabel}
        </TooltipPopup>
      </Tooltip>
      {showPanelSideSwap && onToggleRightPanelSide ? (
        <Tooltip>
          <TooltipTrigger render={<span className="flex shrink-0" />}>
            <Toggle
              className="shrink-0 [-webkit-app-region:no-drag]"
              aria-label={sideSwapLabel}
              variant="ghost"
              size="sm"
              onPressedChange={onToggleRightPanelSide}
            >
              <ArrowLeftRightIcon className="size-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipPopup side="bottom">{sideSwapLabel}</TooltipPopup>
        </Tooltip>
      ) : null}
    </div>
  );
});

export const RightPanelMaximizeControl = memo(function RightPanelMaximizeControl({
  maximized,
  onToggle,
}: {
  maximized: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const label = maximized ? t("chat.panel.restore") : t("chat.panel.maximize");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            className="shrink-0 [-webkit-app-region:no-drag]"
            pressed={maximized}
            onPressedChange={onToggle}
            aria-label={label}
            variant="ghost"
            size="sm"
          >
            {maximized ? (
              <Minimize2Icon className="size-4" />
            ) : (
              <Maximize2Icon className="size-4" />
            )}
          </Toggle>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
});
