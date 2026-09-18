import { PermissionChecklist, PermissionContinueButton } from "../permissions/PermissionChecklist";
import { usePermissionStatus } from "../permissions/usePermissionStatus";
import {
  isModifierPairShortcut,
  type DesktopCaptureExtensionState,
  type DesktopSnapShotSetupAction,
  type DesktopSnapShotState,
} from "@t3tools/contracts";
import { useId, useState, type ReactNode } from "react";
import { useI18n, type MessageKey, type Translate } from "../../i18n";
import { CaptureShortcutConfig } from "./CaptureShortcutConfig";
import { Button } from "../ui/button";
import { Dialog, DialogDescription } from "../ui/dialog";
import { WizardSteps, WizardPopup, WizardHeader, WizardPanel, WizardFooter } from "../ui/wizard";
import {
  captureSetupAccessReady,
  captureSetupBackend,
  captureSetupCheckMessage,
  captureSetupDesktopName,
  captureSetupInitialStep,
  captureSetupShortcutReady,
  type CaptureSetupStep,
} from "./SnapShotSetupDialog.logic";

const SETUP_STEPS = [
  { id: "access", labelKey: "snapShot.setup.stepAccess" },
  { id: "shortcut", labelKey: "snapShot.setup.stepShortcut" },
] as const satisfies ReadonlyArray<{
  readonly id: CaptureSetupStep;
  readonly labelKey: MessageKey;
}>;

const GNOME_ACCESS_COPY_KEYS = {
  "not-installed": {
    title: "snapShot.setup.gnome.notInstalled.title",
    description: "snapShot.setup.gnome.notInstalled.description",
  },
  "restart-required": {
    title: "snapShot.setup.gnome.restartRequired.title",
    description: "snapShot.setup.gnome.restartRequired.description",
  },
  "update-required": {
    title: "snapShot.setup.gnome.updateRequired.title",
    description: "snapShot.setup.gnome.updateRequired.description",
  },
  "extensions-disabled": {
    title: "snapShot.setup.gnome.extensionsDisabled.title",
    description: "snapShot.setup.gnome.extensionsDisabled.description",
  },
  disabled: {
    title: "snapShot.setup.gnome.disabled.title",
    description: "snapShot.setup.gnome.disabled.description",
  },
  enabled: {
    title: "snapShot.setup.gnome.enabled.title",
    description: "snapShot.setup.gnome.enabled.description",
  },
  unsupported: {
    title: "snapShot.setup.gnome.unsupported.title",
    description: "snapShot.setup.gnome.unsupported.description",
  },
  error: {
    title: "snapShot.setup.gnome.error.title",
    description: "snapShot.setup.gnome.error.description",
  },
} as const satisfies Record<
  DesktopCaptureExtensionState["status"],
  { readonly title: MessageKey; readonly description: MessageKey }
>;

function gnomeAccessCopy(
  status: keyof typeof GNOME_ACCESS_COPY_KEYS,
  t: Translate,
): { title: string; description: string } {
  const keys = GNOME_ACCESS_COPY_KEYS[status];
  return { title: t(keys.title), description: t(keys.description) };
}

function ScreenRecordingIcon() {
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 32 32"
      className="size-8 shrink-0 drop-shadow-[0_1px_1px_#0005]"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x2="0" y2="1">
          <stop stopColor="#ff6972" />
          <stop offset="1" stopColor="#ff2938" />
        </linearGradient>
      </defs>
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="7"
        fill={`url(#${gradientId})`}
        stroke="#ffffff40"
      />
      <circle cx="16" cy="16" r="10" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="16" cy="16" r="4.5" fill="#fff" />
    </svg>
  );
}

function AccessibilityPermissionIcon() {
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 32 32"
      className="size-8 shrink-0 drop-shadow-[0_1px_1px_#0005]"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x2="0" y2="1">
          <stop stopColor="#48b6ff" />
          <stop offset="1" stopColor="#0085ff" />
        </linearGradient>
      </defs>
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="7"
        fill={`url(#${gradientId})`}
        stroke="#ffffff40"
      />
      <circle cx="16" cy="16" r="10" fill="none" stroke="#fff" strokeWidth="1.75" />
      <circle cx="16" cy="10" r="1.6" fill="#fff" />
      <path
        d="m10 13 6 1 6-1M16 14v4m0 0-2.5 6m2.5-6 2.5 6"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SnapShotSetupDialog({
  state,
  initialStep,
  wasEnabled,
  includeAccessibility,
  busy: actionBusy,
  error,
  shortcutInput,
  shortcutStatus,
  shortcutChanged,
  canSaveShortcut,
  onSaveShortcut,
  onEnable,
  onAction,
  onRefresh,
  onClose,
  onLeaveStep,
}: {
  state: DesktopSnapShotState;
  initialStep: CaptureSetupStep;
  wasEnabled: boolean;
  includeAccessibility: boolean;
  busy: boolean;
  error: string | null;
  shortcutInput: ReactNode;
  shortcutStatus: string | null | undefined;
  shortcutChanged: boolean;
  canSaveShortcut: boolean;
  onSaveShortcut: () => Promise<boolean>;
  onEnable: () => Promise<boolean>;
  onAction: (action: DesktopSnapShotSetupAction) => Promise<void>;
  onRefresh: () => Promise<DesktopSnapShotState | undefined>;
  onClose: (completed: boolean) => Promise<void>;
  onLeaveStep: () => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(() => captureSetupInitialStep(state, initialStep));
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [configBusy, setConfigBusy] = useState(false);
  const busy = actionBusy || checking || configBusy;
  const backend = captureSetupBackend(state);
  const configShortcut = backend === "niri" || backend === "hyprland";
  const desktop = captureSetupDesktopName(state);
  const extension = state.gnomeExtension;
  const helper = backend === "hyprland" ? state.hyprlandHelper : state.kdeHelper;
  const helperBackend = backend === "kde" || backend === "hyprland";
  const installHelper = backend === "hyprland" ? "install-hyprland-helper" : "install-kde-helper";
  const removeHelper = backend === "hyprland" ? "remove-hyprland-helper" : "remove-kde-helper";
  const accessReady = captureSetupAccessReady(state);
  const permissionStatus = usePermissionStatus(
    async () => {
      const refreshed = await onRefresh();
      if (!refreshed?.macPermissions) throw new Error(t("snapShot.setup.permissionUnavailable"));
      return refreshed.macPermissions;
    },
    state.macPermissions ?? { screenRecording: false, accessibility: false },
    Boolean(state.macPermissions) && step === "access" && !busy,
  );
  const macPermissions = state.macPermissions ? permissionStatus.status : undefined;
  const macPermissionsReady =
    !macPermissions ||
    permissionStatus.isReady(
      includeAccessibility ? ["screenRecording", "accessibility"] : ["screenRecording"],
    );
  const shortcutReady = captureSetupShortcutReady(state, shortcutChanged);
  const install = extension?.status === "not-installed" || extension?.status === "update-required";
  const enable = extension?.status === "disabled";
  const changeStep = (next: CaptureSetupStep) => {
    onLeaveStep();
    setChecked(false);
    setStep(next);
  };
  const checkAgain = async () => {
    if (busy) return;
    setChecking(true);
    setChecked(false);
    try {
      setChecked((await onRefresh()) !== undefined);
    } finally {
      setChecking(false);
    }
  };
  const accessCopy =
    state.message && !macPermissions
      ? {
          title: t("snapShot.setup.retryTitle"),
          description: t("snapShot.setup.retryDescription"),
        }
      : backend === "gnome" && extension
        ? extension.status === "enabled" && !accessReady
          ? {
              title: t("snapShot.setup.checkAccessTitle"),
              description: t("snapShot.setup.checkAccessDescription"),
            }
          : gnomeAccessCopy(extension.status, t)
        : helperBackend
          ? helper?.status === "ready"
            ? {
                title: t("snapShot.setup.gnome.enabled.title"),
                description: t("snapShot.setup.gnome.enabled.description"),
              }
            : helper?.status === "error"
              ? {
                  title: t("snapShot.setup.fixAccessTitle"),
                  description: t("snapShot.setup.fixAccessDescription"),
                }
              : {
                  title:
                    helper?.status === "update-required"
                      ? t("snapShot.setup.updateHelper")
                      : t("snapShot.setup.allowSnapshots"),
                  description: t("snapShot.setup.helperDescription"),
                }
          : backend === "niri"
            ? {
                title: t("snapShot.setup.gnome.enabled.title"),
                description: t("snapShot.setup.gnome.enabled.description"),
              }
            : backend === "picker"
              ? {
                  title: t("snapShot.setup.pickerTitle"),
                  description: t("snapShot.setup.pickerDescription"),
                }
              : {
                  title: t("snapShot.setup.allowSnapshots"),
                  description:
                    backend === "portal"
                      ? t("snapShot.setup.portalPermission")
                      : macPermissions
                        ? macPermissionsReady
                          ? t("snapShot.setup.macTestCapture")
                          : t("snapShot.setup.macAllowEach")
                        : t("snapShot.setup.allowWhenPrompted"),
                };
  const title = step === "access" ? accessCopy.title : t("snapShot.setup.chooseShortcut");
  const description =
    step === "access"
      ? accessCopy.description
      : configShortcut
        ? t("snapShot.setup.clickThenPress")
        : state.mode === "portal"
          ? t("snapShot.setup.chooseThenApprove")
          : t("snapShot.setup.useBothShifts");
  const stepIndex = SETUP_STEPS.findIndex(({ id }) => id === step);
  const details = [
    ...new Set(
      [
        error,
        ...(step === "access"
          ? [
              state.message,
              backend === "gnome" &&
              (extension?.status === "error" || extension?.status === "unsupported")
                ? extension.message
                : null,
              helperBackend && helper?.status === "error" ? helper.message : null,
            ]
          : []),
      ].filter((detail) => detail !== null),
    ),
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) void onClose(false);
      }}
    >
      <WizardPopup showCloseButton={!busy}>
        <WizardHeader
          title={desktop ? t("snapShot.setup.titleNamed", { desktop }) : t("snapShot.setup.title")}
        >
          <WizardSteps
            steps={SETUP_STEPS.map((item) => t(item.labelKey))}
            currentStep={stepIndex}
            isStepDisabled={(index) => busy || index > stepIndex}
            onStepChange={(index) => {
              const next = SETUP_STEPS[index];
              if (next && next.id !== step) changeStep(next.id);
            }}
          />
        </WizardHeader>
        <WizardPanel>
          <div className="space-y-4 text-sm">
            <div className="space-y-2" aria-live="polite">
              <h3 className="flex items-center gap-2 font-medium">{title}</h3>
              <DialogDescription>{description}</DialogDescription>
            </div>
            {step === "access" ? (
              <>
                <p
                  role="status"
                  aria-atomic="true"
                  className={
                    checked && !busy && !error ? "text-xs text-muted-foreground" : "sr-only"
                  }
                >
                  {checked && !busy && !error ? captureSetupCheckMessage(state) : null}
                </p>
                {macPermissions ? (
                  <PermissionChecklist
                    busy={busy}
                    permissions={[
                      {
                        id: "screenRecording",
                        icon: <ScreenRecordingIcon />,
                        title: t("snapShot.setup.screenRecording"),
                        description: t("snapShot.setup.screenRecordingDescription"),
                        granted: macPermissions.screenRecording,
                        onAllow: () => void onAction("allow-screen-recording"),
                      },
                      {
                        id: "accessibility",
                        icon: <AccessibilityPermissionIcon />,
                        title: t("snapShot.setup.accessibility"),
                        description: includeAccessibility
                          ? t("snapShot.setup.accessibilityRequired")
                          : t("snapShot.setup.accessibilityOptional"),
                        granted: macPermissions.accessibility,
                        onAllow: () => void onAction("allow-accessibility"),
                      },
                    ]}
                  />
                ) : null}
                {permissionStatus.error && macPermissions ? (
                  <p role="status" className="text-xs text-muted-foreground">
                    {permissionStatus.error}
                  </p>
                ) : null}
                {helperBackend && helper?.status === "error" ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onAction(installHelper)}
                  >
                    {t("snapShot.setup.reinstallHelper")}
                  </Button>
                ) : null}
              </>
            ) : configShortcut ? (
              <CaptureShortcutConfig
                state={state}
                disabled={actionBusy || checking || !accessReady}
                onBusyChange={setConfigBusy}
                onSaved={onRefresh}
                onComplete={() => onClose(true)}
              />
            ) : (
              <div className="space-y-3">
                {shortcutInput}
                {shortcutStatus ? (
                  <p className="text-xs text-muted-foreground" role="status">
                    {shortcutStatus}
                  </p>
                ) : null}
                {!shortcutChanged &&
                !state.shortcutRegistered &&
                !state.shortcutPending &&
                state.shortcutCanRetry !== false &&
                !isModifierPairShortcut(state.shortcut) ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void onAction("retry-shortcut")}
                  >
                    {state.mode === "portal"
                      ? t("snapShot.setup.shortcutPermissions")
                      : t("common.tryAgain")}
                  </Button>
                ) : null}
              </div>
            )}
            {step === "shortcut" && !accessReady ? (
              <p role="alert" className="text-destructive">
                {t("snapShot.setup.needsAttention")}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-destructive">
                {t("snapShot.setup.stepFailed")}
              </p>
            ) : null}
            {details.length > 0 || (step === "access" && (backend === "gnome" || helperBackend)) ? (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">{t("snapShot.setup.advanced")}</summary>
                <div className="mt-3 space-y-3">
                  {details.map((detail) => (
                    <p key={detail} className="break-words">
                      {detail}
                    </p>
                  ))}
                  {step === "access" && (backend === "gnome" || helperBackend) ? (
                    <p>{t("snapShot.setup.included")}</p>
                  ) : null}
                  {step === "access" && backend === "gnome" && extension?.status === "enabled" ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void onAction("disable-extension")}
                    >
                      {t("snapShot.setup.disableExtension")}
                    </Button>
                  ) : null}
                  {step === "access" && helperBackend && helper?.status !== "not-installed" ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void onAction(removeHelper)}
                    >
                      {t("snapShot.setup.removeHelper")}
                    </Button>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </WizardPanel>
        <WizardFooter>
          {step !== "access" ? (
            <Button variant="ghost" disabled={busy} onClick={() => changeStep("access")}>
              {t("common.back")}
            </Button>
          ) : null}
          <Button variant="ghost" disabled={busy} onClick={() => void onClose(false)}>
            {wasEnabled ? t("common.close") : t("snapShot.setup.finishLater")}
          </Button>
          {step === "access" ? (
            helperBackend && !accessReady && helper?.status !== "ready" ? (
              <Button
                disabled={busy}
                aria-busy={busy}
                onClick={() =>
                  void (helper?.status === "error" ? checkAgain() : onAction(installHelper))
                }
              >
                {checking
                  ? t("common.checking")
                  : busy
                    ? t("snapShot.setup.installing")
                    : helper?.status === "error"
                      ? t("snapShot.setup.checkAgain")
                      : helper?.status === "update-required"
                        ? t("snapShot.setup.updateHelperButton")
                        : t("snapShot.setup.installHelper")}
              </Button>
            ) : backend === "gnome" && !accessReady && extension?.status !== "enabled" ? (
              <Button
                disabled={busy}
                aria-busy={checking}
                onClick={() =>
                  void (install
                    ? onAction("install-extension")
                    : enable
                      ? onAction("enable-extension")
                      : checkAgain())
                }
              >
                {checking
                  ? t("common.checking")
                  : busy
                    ? install
                      ? t("snapShot.setup.installing")
                      : enable
                        ? t("snapShot.setup.enabling")
                        : t("snapShot.setup.working")
                    : install
                      ? extension?.status === "update-required"
                        ? t("snapShot.setup.updateExtension")
                        : t("snapShot.setup.installExtension")
                      : enable
                        ? t("snapShot.setup.enableExtension")
                        : t("snapShot.setup.checkAgain")}
              </Button>
            ) : (
              <PermissionContinueButton
                ready={macPermissionsReady}
                busy={busy}
                onClick={async () => {
                  if (await onEnable()) changeStep("shortcut");
                }}
              >
                {busy
                  ? t("snapShot.setup.working")
                  : macPermissions
                    ? t("snapShot.setup.testAndContinue")
                    : backend === "direct"
                      ? t("snapShot.setup.allowCapture")
                      : !accessReady && !macPermissions
                        ? t("common.tryAgain")
                        : t("common.next")}
              </PermissionContinueButton>
            )
          ) : !configShortcut ? (
            <Button
              disabled={
                busy || !accessReady || (shortcutChanged ? !canSaveShortcut : !shortcutReady)
              }
              onClick={async () => {
                if (!shortcutChanged || (await onSaveShortcut())) await onClose(true);
              }}
            >
              {busy
                ? t("common.saving")
                : shortcutChanged
                  ? t("snapShot.setup.saveAndFinish")
                  : t("snapShot.setup.done")}
            </Button>
          ) : null}
        </WizardFooter>
      </WizardPopup>
    </Dialog>
  );
}
