import { useState } from "react";

import {
  hasDesktopNotifications,
  hasNotificationSound,
  unlockNotificationAudio,
} from "../../threadNotifications";
import { useI18n, type Translate } from "../../i18n";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

function notificationModeLabels(t: Translate) {
  return {
    off: t("settings.notifications.off"),
    notifications: t("settings.notifications.notificationsOnly"),
    sound: t("settings.notifications.soundOnly"),
    "notifications-and-sound": t("settings.notifications.withSound"),
  } as const;
}

export function NotificationSettings() {
  const { t } = useI18n();
  const modeLabels = notificationModeLabels(t);
  const mode = useScopedSettings((settings) => settings.notificationMode);
  const updateSettings = useUpdateScopedSettings();
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  return (
    <SettingsRow
      {...searchableSetting("thread-notifications", t)}
      description={permissionMessage ?? t("settings.notifications.description")}
      control={
        <Select
          value={mode}
          disabled={requesting}
          onValueChange={async (value) => {
            if (
              value !== "off" &&
              value !== "notifications" &&
              value !== "sound" &&
              value !== "notifications-and-sound"
            )
              return;
            setPermissionMessage(null);
            if (hasNotificationSound(value)) unlockNotificationAudio();
            if (hasDesktopNotifications(value)) {
              if (typeof Notification === "undefined" || !window.isSecureContext) {
                setPermissionMessage(t("settings.notifications.needHttps"));
                return;
              }
              setRequesting(true);
              try {
                const permission = await Notification.requestPermission();
                if (permission !== "granted") {
                  setPermissionMessage(t("settings.notifications.allowPermission"));
                  return;
                }
              } catch {
                setPermissionMessage(t("settings.notifications.unavailable"));
                return;
              } finally {
                setRequesting(false);
              }
            }
            updateSettings({ notificationMode: value });
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full sm:w-56"
            aria-label={t("settings.notifications.aria")}
          >
            <SelectValue>{modeLabels[mode]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {Object.entries(modeLabels).map(([value, label]) => (
              <SelectItem key={value} hideIndicator value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}
