import { useAtomValue } from "@effect/atom-react";
import {
  isModifierPairShortcut,
  type ClientSettingsPatch,
  type DesktopSnapShotShortcutAvailability,
  type DesktopSnapShotState,
  type DesktopSnapShotSetupAction,
  type SnapShotShortcut,
} from "@t3tools/contracts";
import { ChevronDownIcon, PlayIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";

import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { getDesktopSnapShotBridge } from "../../lib/desktopSnapShot";
import {
  readSnapShotSetupResume,
  saveSnapShotSetupResume,
  clearSnapShotSetupResume,
} from "../../lib/snapShotSetupResume";
import { sameSnapShotShortcut, snapShotKeybindingConflict } from "../../lib/snapShotShortcut";
import { playSnapShotSound } from "../../lib/snapShotSound";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { localizedCommandLabel } from "./KeybindingsSettings.logic";
import {
  snapShotStatus,
  snapShotShortcutStatus,
  snapShotSetupButtonLabel,
  snapShotUnavailableMessage,
  snapShotSoundPatch,
  snapShotFeedbackUnavailableMessage,
  snapShotDescription,
  snapShotAccessibilityUnavailableMessage,
  snapShotSetupComplete,
  type SnapShotSoundSelection,
} from "./SnapShotSettings.logic";
import {
  SettingsUnavailableGroup,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
import { selectTriggerVariants } from "../ui/select";
import { Switch } from "../ui/switch";
import { toastManager } from "../ui/toast";
import { SnapShotSetupDialog } from "./SnapShotSetupDialog";
import { useSnapShotShortcutRecorder } from "./useSnapShotShortcutRecorder";
import { useI18n } from "../../i18n";
import {
  captureSetupAccessReady,
  captureSetupInitialStep,
  captureSetupShouldDisableOnClose,
  type CaptureSetupStep,
} from "./SnapShotSetupDialog.logic";

const soundOptionRowClassName =
  "grid grid-cols-[1fr_auto] rounded-sm has-data-checked:bg-foreground/[0.08]";
const soundOptionItemClassName = "data-checked:bg-transparent";
const soundPreviewClassName = "min-h-7 w-7 justify-center px-0";

function captureSettingsError(title: string, error: unknown, fallback: string) {
  return { title, message: error instanceof Error ? error.message : fallback };
}

type ShortcutCheck =
  | { readonly status: "idle"; readonly availability: null }
  | { readonly status: "checking"; readonly availability: null }
  | {
      readonly status: "checked";
      readonly availability: DesktopSnapShotShortcutAvailability;
    };

export function SnapShotSettings() {
  const { t } = useI18n();
  const settings = useClientSettings();
  const updateSettings = useUpdateClientSettings();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const bridge = getDesktopSnapShotBridge();
  const [state, setState] = useState<DesktopSnapShotState | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState<ReturnType<typeof captureSettingsError> | null>(
    null,
  );
  const [wizard, setWizard] = useState<{
    initialStep: CaptureSetupStep;
    wasEnabled: boolean;
  } | null>(null);
  const [candidate, setCandidate] = useState<SnapShotShortcut>(settings.snapShotShortcut);
  const [shortcutCheck, setShortcutCheck] = useState<ShortcutCheck>({
    status: "idle",
    availability: null,
  });
  const shortcutCheckIdRef = useRef(0);
  const stateRequestIdRef = useRef(0);
  const unavailableMessage = snapShotUnavailableMessage(Boolean(bridge), t);
  const captureAvailable = Boolean(bridge) && state !== null && state.mode !== "unavailable";
  const feedbackUnavailable = snapShotFeedbackUnavailableMessage(state, t);
  const savedShortcut = settings.snapShotShortcut;
  const managedShortcut = state?.linuxBackend === "niri" || state?.linuxBackend === "hyprland";
  const shortcutChanged = !managedShortcut && !sameSnapShotShortcut(candidate, savedShortcut);
  const displayShortcut = shortcutChanged ? candidate : (state?.shortcut ?? savedShortcut);
  const candidateConflict = shortcutChanged
    ? snapShotKeybindingConflict(candidate, keybindings)
    : null;
  const canSaveShortcut =
    shortcutChanged && candidateConflict === null && shortcutCheck.availability?.available === true;
  const soundSelection = settings.snapShotPlaySound ? settings.snapShotSound : "off";
  const soundLabel =
    soundSelection === "off"
      ? t("common.off")
      : soundSelection === "soft-pop"
        ? `${t("snapShot.soundWhoosh")} (${t("common.default")})`
        : t("snapShot.soundClick");

  const refreshState = useCallback(async () => {
    const requestId = ++stateRequestIdRef.current;
    try {
      if (bridge) {
        const nextState = await bridge.getSnapShotState();
        if (requestId === stateRequestIdRef.current) setState(nextState);
        return nextState;
      }
    } catch (error) {
      if (requestId === stateRequestIdRef.current)
        setSetupError(
          captureSettingsError(t("snapShot.checkSetupFailed"), error, t("snapShot.tryAgain")),
        );
    }
  }, [bridge, t]);

  const setup = useCallback(
    async (action: DesktopSnapShotSetupAction) => {
      if (!bridge?.setupSnapShot || setupBusy) return;
      setSetupBusy(true);
      setSetupError(null);
      try {
        if (
          state?.macPermissions &&
          wizard &&
          (action === "allow-screen-recording" || action === "allow-accessibility")
        ) {
          // macOS can quit the app from its permission prompt.
          saveSnapShotSetupResume(wizard.wasEnabled);
        }
        await bridge.setupSnapShot(action);
        await refreshState();
      } catch (error) {
        setSetupError(
          captureSettingsError(
            action === "retry-shortcut"
              ? t("snapShot.shortcutPermissionsFailed")
              : t("snapShot.setupFailed"),
            error,
            t("snapShot.tryAgain"),
          ),
        );
      } finally {
        setSetupBusy(false);
      }
    },
    [bridge, refreshState, setupBusy, state, t, wizard],
  );

  useEffect(() => {
    if (!setupError || wizard) return;
    toastManager.add({
      type: "error",
      title: setupError.title,
      description: setupError.message,
    });
    setSetupError(null);
  }, [setupError, wizard]);

  useEffect(() => {
    let cancelled = false;
    void refreshState().then((current) => {
      const resume = readSnapShotSetupResume();
      if (!cancelled && current?.macPermissions && resume) {
        setWizard({ initialStep: "access", wasEnabled: resume.wasEnabled });
      }
    });
    window.addEventListener("focus", refreshState);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshState);
    };
  }, [refreshState]);

  useEffect(
    () =>
      bridge?.onSnapShotEvent((event) => {
        if (event.type === "shortcut-changed") void refreshState();
      }),
    [bridge, refreshState],
  );

  useEffect(() => {
    shortcutCheckIdRef.current++;
    setCandidate(savedShortcut);
    setShortcutCheck({ status: "idle", availability: null });
  }, [savedShortcut]);

  const save = useCallback(
    async (patch: ClientSettingsPatch) => {
      setSetupError(null);
      try {
        await updateSettings(patch);
        return await refreshState();
      } catch (error) {
        setSetupError(
          captureSettingsError(t("snapShot.saveFailed"), error, t("snapShot.tryAgain")),
        );
      }
    },
    [refreshState, t, updateSettings],
  );

  const saveIncludeAccessibility = useCallback(
    async (includeAccessibility: boolean) => {
      try {
        if (includeAccessibility && settings.snapShotEnabled)
          await bridge?.requestSnapShotPermissions(true);
        await save({ snapShotIncludeAccessibility: includeAccessibility });
      } catch (error) {
        setSetupError(
          captureSettingsError(t("snapShot.allowTextFailed"), error, t("snapShot.tryAgain")),
        );
      }
    },
    [bridge, save, settings.snapShotEnabled, t],
  );

  const checkShortcut = useCallback(
    async (shortcut: SnapShotShortcut) => {
      const checkId = ++shortcutCheckIdRef.current;
      setCandidate(shortcut);
      const conflict = snapShotKeybindingConflict(shortcut, keybindings);
      if (conflict || !bridge) return;
      setShortcutCheck({ status: "checking", availability: null });
      try {
        const availability = await bridge.checkSnapShotShortcut(shortcut);
        if (checkId === shortcutCheckIdRef.current) {
          setShortcutCheck({ status: "checked", availability });
        }
      } catch (error) {
        if (checkId !== shortcutCheckIdRef.current) return;
        setShortcutCheck({
          status: "checked",
          availability: {
            available: false,
            message: error instanceof Error ? error.message : t("snapShot.checkShortcutFailed"),
          },
        });
      }
    },
    [bridge, keybindings, t],
  );

  const {
    recording,
    stopRecording,
    input: shortcutInput,
  } = useSnapShotShortcutRecorder({
    shortcut: displayShortcut,
    shortcutLabel: !shortcutChanged ? state?.shortcutLabel : undefined,
    disabled: setupBusy,
    allowModifierPairs: state?.mode !== "portal",
    onRecord: (shortcut) => void checkShortcut(shortcut),
    onStart: () => {
      shortcutCheckIdRef.current++;
      setShortcutCheck({ status: "idle", availability: null });
    },
    onError: (message) =>
      setShortcutCheck({ status: "checked", availability: { available: false, message } }),
  });

  const shortcutStatus = recording
    ? t("snapShot.pressShortcut")
    : candidateConflict
      ? t("snapShot.shortcutConflict", { command: localizedCommandLabel(candidateConflict, t) })
      : shortcutCheck.status === "checking"
        ? t("snapShot.checkingShortcut")
        : shortcutCheck.availability
          ? shortcutCheck.availability.available
            ? t("snapShot.readyToSave")
            : shortcutCheck.availability.message
          : state?.mode === "portal" &&
              !state.shortcutLabel &&
              isModifierPairShortcut(displayShortcut)
            ? t("snapShot.tryCtrlShift2")
            : snapShotShortcutStatus(state, t);

  const openSetup = async (requested: CaptureSetupStep | "resume" = "resume") => {
    if (!state || setupBusy) return;
    stopRecording();
    shortcutCheckIdRef.current++;
    setCandidate(savedShortcut);
    setShortcutCheck({ status: "idle", availability: null });
    setSetupError(null);
    setSetupBusy(true);
    try {
      let current = await refreshState();
      if (!current) return;
      if (current.macPermissions) requested = "access";
      if (!settings.snapShotEnabled && captureSetupInitialStep(current, requested) !== "access") {
        // Opening setup is the opt-in. Restore registration before resuming a
        // later step, just as Continue does on the access step.
        current = await save({ snapShotEnabled: true });
        if (!current) {
          // A settings write can succeed even if the following status check
          // fails. Keep Finish later available to turn capture back off.
          setWizard({ initialStep: "access", wasEnabled: false });
          return;
        }
      }
      setWizard({
        initialStep: captureSetupInitialStep(current, requested),
        wasEnabled: settings.snapShotEnabled,
      });
    } finally {
      setSetupBusy(false);
    }
  };

  const enableForSetup = async () => {
    if (setupBusy) return false;
    setSetupBusy(true);
    setSetupError(null);
    try {
      if (state?.macPermissions) {
        saveSnapShotSetupResume(wizard?.wasEnabled ?? settings.snapShotEnabled);
        if (!bridge?.setupSnapShot) throw new Error(t("snapShot.restartToFinish"));
        await bridge.setupSnapShot("test-mac-capture");
      }
      if (state?.mode === "direct")
        await bridge?.requestSnapShotPermissions(settings.snapShotIncludeAccessibility);
      const nextState =
        settings.snapShotEnabled && !state?.message
          ? await refreshState()
          : await save({ snapShotEnabled: true });
      return nextState !== undefined && captureSetupAccessReady(nextState);
    } catch (error) {
      setSetupError(
        captureSettingsError(t("snapShot.verifyAccessFailed"), error, t("snapShot.tryAgain")),
      );
      return false;
    } finally {
      setSetupBusy(false);
    }
  };

  const closeSetup = async (completed: boolean) => {
    if (!wizard || setupBusy) return;
    setSetupBusy(true);
    try {
      if (
        settings.snapShotEnabled &&
        captureSetupShouldDisableOnClose(wizard.wasEnabled, completed)
      ) {
        if (!(await save({ snapShotEnabled: false }))) return;
      }
      stopRecording();
      setSetupError(null);
      clearSnapShotSetupResume();
      setWizard(null);
    } catch (error) {
      setSetupError(
        captureSettingsError(t("snapShot.closeSetupFailed"), error, t("snapShot.tryAgain")),
      );
    } finally {
      setSetupBusy(false);
    }
  };

  const saveShortcut = async () => {
    if (!canSaveShortcut || setupBusy) return false;
    setSetupBusy(true);
    try {
      const saved = await save({ snapShotShortcut: candidate });
      return Boolean(saved?.shortcutRegistered || saved?.shortcutPending);
    } finally {
      setSetupBusy(false);
    }
  };

  return (
    <SettingsPageContainer>
      <SettingsSection id="snap-shot" title={t("settings.nav.snapShot")}>
        <SettingsUnavailableGroup message={unavailableMessage}>
          <SettingsRow
            {...searchableSetting("snap-shot-enabled", t)}
            description={snapShotDescription(state, t)}
            status={
              bridge
                ? setupBusy && !wizard
                  ? t("snapShot.updating")
                  : snapShotStatus(state, settings.snapShotEnabled, t)
                : undefined
            }
            control={
              <>
                {settings.snapShotEnabled &&
                !snapShotSetupComplete(state, settings.snapShotIncludeAccessibility) ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={setupBusy}
                    onClick={() => void openSetup()}
                  >
                    {snapShotSetupButtonLabel(state, t)}
                  </Button>
                ) : null}
                <Switch
                  checked={settings.snapShotEnabled || Boolean(wizard)}
                  disabled={!captureAvailable || setupBusy}
                  aria-label={t("snapShot.enableAria")}
                  onCheckedChange={(checked) => {
                    if (!checked) void save({ snapShotEnabled: false });
                    else if (state?.windows) void save({ snapShotEnabled: true });
                    else void openSetup();
                  }}
                />
              </>
            }
          />
          {settings.snapShotEnabled && captureAvailable ? (
            <>
              <SettingsRow
                {...searchableSetting("snap-shot-accessibility", t)}
                description={t("snapShot.includeTextDescription")}
                status={snapShotAccessibilityUnavailableMessage(state, t)}
                control={
                  <Switch
                    checked={
                      !snapShotAccessibilityUnavailableMessage(state, t) &&
                      settings.snapShotIncludeAccessibility
                    }
                    disabled={
                      !captureAvailable ||
                      Boolean(snapShotAccessibilityUnavailableMessage(state, t))
                    }
                    aria-label={t("snapShot.includeTextAria")}
                    onCheckedChange={(checked) => void saveIncludeAccessibility(checked)}
                  />
                }
              />
              <SettingsRow
                {...searchableSetting("snap-shot-shortcut", t)}
                description={
                  state?.linuxBackend === "picker"
                    ? t("snapShot.chooseWindowDescription")
                    : t("snapShot.captureActiveWindowDescription")
                }
                status={managedShortcut ? undefined : shortcutStatus}
                control={
                  managedShortcut ? (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={setupBusy}
                      onClick={() => void openSetup("shortcut")}
                    >
                      {t("snapShot.changeShortcut")}
                    </Button>
                  ) : (
                    <>
                      {shortcutInput}
                      {shortcutChanged ? (
                        <>
                          <Button
                            size="xs"
                            disabled={!canSaveShortcut || setupBusy}
                            onClick={() => void saveShortcut()}
                          >
                            {setupBusy ? t("common.saving") : t("common.save")}
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={setupBusy}
                            onClick={() => {
                              stopRecording();
                              shortcutCheckIdRef.current++;
                              setCandidate(savedShortcut);
                              setShortcutCheck({ status: "idle", availability: null });
                            }}
                          >
                            {t("common.cancel")}
                          </Button>
                        </>
                      ) : state?.mode === "portal" &&
                        state.shortcutCanRetry !== false &&
                        !isModifierPairShortcut(savedShortcut) ? (
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={setupBusy || state.shortcutPending}
                          onClick={() => void setup("retry-shortcut")}
                        >
                          {t("snapShot.setup.shortcutPermissions")}
                        </Button>
                      ) : null}
                    </>
                  )
                }
              />
              <SettingsRow
                {...searchableSetting("snap-shot-sound", t)}
                description={t("snapShot.soundDescription")}
                control={
                  <Menu>
                    <MenuTrigger
                      aria-label={t("snapShot.soundAria", { label: soundLabel })}
                      className={cn(selectTriggerVariants({ size: "sm" }), "w-auto min-w-0")}
                      disabled={!captureAvailable}
                    >
                      <span className="min-w-0 flex-1 truncate text-left">
                        {soundSelection === "off" ? (
                          t("common.off")
                        ) : soundSelection === "soft-pop" ? (
                          <>
                            {t("snapShot.soundWhoosh")}{" "}
                            <span className="text-muted-foreground">({t("common.default")})</span>
                          </>
                        ) : (
                          t("snapShot.soundClick")
                        )}
                      </span>
                      <ChevronDownIcon className="-me-1 size-3 shrink-0 opacity-50" />
                    </MenuTrigger>
                    <MenuPopup align="end">
                      <MenuRadioGroup
                        onValueChange={(value) =>
                          void save(snapShotSoundPatch(value as SnapShotSoundSelection))
                        }
                        value={soundSelection}
                      >
                        <MenuRadioItem closeOnClick value="off">
                          {t("common.off")}
                        </MenuRadioItem>
                        <div className={soundOptionRowClassName}>
                          <MenuRadioItem
                            className={soundOptionItemClassName}
                            closeOnClick
                            value="soft-pop"
                          >
                            {t("snapShot.soundWhoosh")}{" "}
                            <span className="text-muted-foreground">({t("common.default")})</span>
                          </MenuRadioItem>
                          <MenuItem
                            aria-label={t("snapShot.playWhoosh")}
                            className={soundPreviewClassName}
                            closeOnClick={false}
                            onClick={() => playSnapShotSound("soft-pop")}
                          >
                            <PlayIcon />
                          </MenuItem>
                        </div>
                        <div className={soundOptionRowClassName}>
                          <MenuRadioItem
                            className={soundOptionItemClassName}
                            closeOnClick
                            value="camera-shutter"
                          >
                            {t("snapShot.soundClick")}
                          </MenuRadioItem>
                          <MenuItem
                            aria-label={t("snapShot.playClick")}
                            className={soundPreviewClassName}
                            closeOnClick={false}
                            onClick={() => playSnapShotSound("camera-shutter")}
                          >
                            <PlayIcon />
                          </MenuItem>
                        </div>
                      </MenuRadioGroup>
                    </MenuPopup>
                  </Menu>
                }
              />
              <SettingsRow
                {...searchableSetting("snap-shot-flash", t)}
                description={t("snapShot.flashDescription")}
                status={feedbackUnavailable}
                control={
                  <Switch
                    checked={!feedbackUnavailable && settings.snapShotFlash}
                    disabled={!captureAvailable || Boolean(feedbackUnavailable)}
                    aria-label={t("snapShot.flashAria")}
                    onCheckedChange={(checked) => void save({ snapShotFlash: checked })}
                  />
                }
              />
              <SettingsRow
                {...searchableSetting("snap-shot-animations", t)}
                description={t("snapShot.animationsDescription")}
                status={feedbackUnavailable}
                control={
                  <Switch
                    checked={!feedbackUnavailable && settings.snapShotAnimations}
                    disabled={!captureAvailable || Boolean(feedbackUnavailable)}
                    aria-label={t("snapShot.animationsAria")}
                    onCheckedChange={(checked) => void save({ snapShotAnimations: checked })}
                  />
                }
              />
            </>
          ) : null}
        </SettingsUnavailableGroup>
      </SettingsSection>
      {wizard && state ? (
        <SnapShotSetupDialog
          state={state}
          initialStep={wizard.initialStep}
          wasEnabled={wizard.wasEnabled}
          includeAccessibility={settings.snapShotIncludeAccessibility}
          busy={setupBusy}
          error={setupError?.message ?? null}
          shortcutInput={shortcutInput}
          shortcutStatus={shortcutStatus}
          shortcutChanged={shortcutChanged}
          canSaveShortcut={canSaveShortcut}
          onSaveShortcut={saveShortcut}
          onEnable={enableForSetup}
          onAction={setup}
          onRefresh={refreshState}
          onClose={closeSetup}
          onLeaveStep={stopRecording}
        />
      ) : null}
    </SettingsPageContainer>
  );
}
