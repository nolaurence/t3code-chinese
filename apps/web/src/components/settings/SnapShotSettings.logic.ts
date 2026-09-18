import type { ClientSettingsPatch, DesktopSnapShotState, SnapShotSound } from "@t3tools/contracts";
import type { Translate } from "../../i18n";
import {
  captureSetupBackend,
  captureSetupDesktopName,
  captureSetupAccessReady,
  captureSetupMacPermissionsReady,
} from "./SnapShotSetupDialog.logic";

export function snapShotStatus(
  state: DesktopSnapShotState | null,
  enabled: boolean,
  t?: Translate,
): string {
  if (!state) return t?.("snapShot.checking") ?? "Checking snapshots…";
  if (state.mode === "unavailable")
    return state.message ?? t?.("snapShot.unsupported") ?? "Not supported on this platform.";
  if (!enabled) return t?.("snapShot.turnOnToSetup") ?? "Turn this on to set up snapshots.";
  return snapShotSetupSummary(state, enabled, t);
}

export function snapShotSetupSummary(
  state: DesktopSnapShotState,
  enabled: boolean,
  t?: Translate,
): string {
  if (state.message) return t?.("snapShot.needsAttention") ?? "Capture needs attention";
  if (state.linuxBackend === "hyprland" && state.hyprlandHelper?.status !== "ready")
    return state.hyprlandHelper?.status === "error"
      ? (t?.("snapShot.checkAccessInSetup") ?? "Check capture access in setup")
      : (t?.("snapShot.installHelperToContinue") ?? "Install the capture helper to continue");
  if (captureSetupBackend(state) === "gnome" && state.gnomeExtension?.status !== "enabled")
    return t?.("snapShot.setupActiveWindow") ?? "Set up active-window snapshots";
  if (captureSetupBackend(state) === "kde" && state.kdeHelper?.status !== "ready")
    return state.kdeHelper?.status === "error"
      ? (t?.("snapShot.checkAccessInSetup") ?? "Check capture access in setup")
      : (t?.("snapShot.installHelperToContinue") ?? "Install the capture helper to continue");
  if (captureSetupBackend(state) === "picker")
    return t?.("snapShot.manualOnly") ?? "Manual capture only — you'll choose a window each time";
  if (!enabled) return t?.("snapShot.enableToContinue") ?? "Enable capture to continue";
  if (state.shortcutPending)
    return state.linuxBackend === "hyprland"
      ? (t?.("snapShot.connectingShortcut") ?? "Connecting your shortcut…")
      : (t?.("snapShot.waitingShortcutPermission") ?? "Waiting for shortcut permission");
  if (state.shortcutVerified) return t?.("snapShot.readyToCapture") ?? "Ready to capture";
  if (state.linuxBackend === "niri" && state.shortcutBinding)
    return t?.("snapShot.useShortcutFromOtherApp") ?? "Use your shortcut from another app";
  if (state.linuxBackend === "hyprland" && state.shortcutActionRegistered)
    return t?.("snapShot.useShortcutFromOtherApp") ?? "Use your shortcut from another app";
  if (state.shortcutRegistered)
    return state.shortcutLabel
      ? (t?.("snapShot.readyToCapture") ?? "Ready to capture")
      : (t?.("snapShot.shortcutSaved") ?? "Shortcut saved");
  return t?.("snapShot.finishShortcutSetup") ?? "Finish shortcut setup";
}

export function snapShotShortcutStatus(
  state: DesktopSnapShotState | null,
  t?: Translate,
): string | null {
  if (!state) return null;
  if (state.linuxBackend === "hyprland") return state.shortcutMessage;
  if (state.shortcutPending)
    return (
      t?.("snapShot.approveShortcutPrompt") ?? "Approve the shortcut permission prompt to continue."
    );
  if (state.shortcutRegistered)
    return state.mode === "portal"
      ? null
      : (t?.("snapShot.shortcutSavedPeriod") ?? "Shortcut saved.");
  return state.shortcutMessage;
}

export function snapShotSetupButtonLabel(
  state: DesktopSnapShotState | null,
  t?: Translate,
): string {
  if (!state) return t?.("snapShot.continueSetup") ?? "Continue setup";
  if (captureSetupAccessReady(state)) return t?.("snapShot.manageCapture") ?? "Manage capture";
  const desktop = captureSetupDesktopName(state);
  return desktop
    ? (t?.("snapShot.setupDesktopCapture", { desktop }) ?? `Set up ${desktop} capture`)
    : (t?.("snapShot.continueSetup") ?? "Continue setup");
}

// Windows needs no permissions or setup: turning capture on is enough. macOS setup
// has nothing left to manage once permissions and the shortcut are in place; the
// shortcut row stays editable inline. Revoking a permission brings the button back
// as "Continue setup" through the state message.
export function snapShotSetupComplete(
  state: DesktopSnapShotState | null,
  includeAccessibility: boolean,
): boolean {
  if (state?.windows) return true;
  return (
    state?.macPermissions !== undefined &&
    captureSetupAccessReady(state) &&
    captureSetupMacPermissionsReady(state, includeAccessibility) &&
    state.shortcutRegistered
  );
}

export type SnapShotSoundSelection = SnapShotSound | "off";

export function snapShotFeedbackUnavailableMessage(
  state: DesktopSnapShotState | null,
  t?: Translate,
): string | undefined {
  if (state?.mode !== "portal" || state.linuxFeedbackAvailable) return undefined;
  if (state.linuxBackend === "hyprland")
    return state.hyprlandHelper?.status === "ready"
      ? (t?.("snapShot.effectsUnavailableDesktop") ??
          "Capture effects aren't available on this desktop.")
      : (t?.("snapShot.installHelperForEffects") ??
          "Install or update the capture helper to enable effects.");
  if (state.linuxBackend === "niri")
    return t?.("snapShot.effectsUnavailableNiri") ?? "Capture effects aren't available on Niri.";
  if (state.linuxBackend === "kde")
    return state.kdeHelper?.status === "ready"
      ? (t?.("snapShot.effectsUnavailableDesktop") ??
          "Capture effects aren't available on this desktop.")
      : (t?.("snapShot.installHelperForEffects") ??
          "Install or update the capture helper to enable effects.");
  return state.linuxBackend === "gnome-extension"
    ? (t?.("snapShot.updateGnomeForEffects") ??
        "Update the GNOME extension, then sign out and back in to enable effects.")
    : captureSetupBackend(state) === "gnome"
      ? (t?.("snapShot.finishExtensionForEffects") ?? "Finish extension setup to enable effects.")
      : (t?.("snapShot.effectsUnavailableDesktop") ??
        "Capture effects aren't available on this desktop.");
}

export function snapShotDescription(state: DesktopSnapShotState | null, t?: Translate): string {
  return state?.mode === "portal" && captureSetupBackend(state) === "picker"
    ? (t?.("snapShot.automaticUnavailable") ??
        "Automatic capture isn't available here. Choose a window instead.")
    : (t?.("snapShot.captureWindowDescription") ??
        "Capture a window and attach it to your current draft.");
}

export function snapShotAccessibilityUnavailableMessage(
  state: DesktopSnapShotState | null,
  t?: Translate,
): string | undefined {
  if (state?.mode !== "portal") return undefined;
  if (state.linuxBackend === "picker" || state.linuxBackend === "screenshot-portal")
    return t?.("snapShot.screenshotOnly") ?? "This desktop only provides a screenshot.";
  return undefined;
}

export function snapShotUnavailableMessage(hasBridge: boolean, t?: Translate): string | undefined {
  if (hasBridge) return undefined;
  return typeof window !== "undefined" && window.desktopBridge
    ? (t?.("snapShot.updateDesktopApp") ?? "Update the desktop app to use snapshots.")
    : (t?.("snapShot.desktopOnly") ?? "Only available in the desktop app.");
}

export function snapShotSoundPatch(sound: SnapShotSoundSelection): ClientSettingsPatch {
  return sound === "off"
    ? { snapShotPlaySound: false }
    : { snapShotPlaySound: true, snapShotSound: sound };
}

export function createRecordingRequestTracker() {
  let currentRequest: symbol | null = null;

  return {
    tryBegin() {
      if (currentRequest) return null;
      currentRequest = Symbol();
      return currentRequest;
    },
    clear() {
      currentRequest = null;
    },
    owns(request: symbol) {
      return currentRequest === request;
    },
  };
}
