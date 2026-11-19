import type { SnoozePresetOptions } from "@t3tools/client-runtime/state/thread-settled";
import { SnoozePresetDay, type TimestampFormat } from "@t3tools/contracts/settings";

import { formatShortTimestamp } from "../timestampFormat";
import type { Locale } from "./locale";
import type { Translate } from "./messages";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
const WEEKDAY_ZH = new Intl.DateTimeFormat("zh-CN", { weekday: "short" });

export const snoozeDurationUnits = { minutes: 1, hours: 60, days: 24 * 60 } as const;
export type SnoozeDurationUnit = keyof typeof snoozeDurationUnits;

export function splitSnoozeDuration(minutes: number) {
  if (minutes % snoozeDurationUnits.days === 0) {
    return { amount: minutes / snoozeDurationUnits.days, unit: "days" } as const;
  }
  if (minutes % snoozeDurationUnits.hours === 0) {
    return { amount: minutes / snoozeDurationUnits.hours, unit: "hours" } as const;
  }
  return { amount: minutes, unit: "minutes" } as const;
}

export function snoozeUnitLabels(amount: number, t: Translate): Record<SnoozeDurationUnit, string> {
  return {
    minutes: t(amount === 1 ? "sidebar.snooze.minute" : "sidebar.snooze.minutes"),
    hours: t(amount === 1 ? "sidebar.snooze.oneHour" : "sidebar.snooze.hours"),
    days: t(amount === 1 ? "sidebar.snooze.day" : "sidebar.snooze.days"),
  };
}

export function snoozeDayLabel(day: SnoozePresetDay, locale: Locale, t: Translate): string {
  if (day === "today") return t("sidebar.snooze.today");
  if (day === "tomorrow") return t("sidebar.snooze.tomorrow");
  if (locale === "en") return day[0]!.toUpperCase() + day.slice(1);
  return WEEKDAY_ZH.format(new Date(2024, 0, 7 + WEEKDAYS.indexOf(day)));
}

export function snoozePresentation(
  timestampFormat: TimestampFormat,
  locale: Locale,
  t: Translate,
): SnoozePresetOptions {
  const formatTime = (date: Date) =>
    formatShortTimestamp(
      date.toISOString(),
      timestampFormat,
      locale === "zh-CN" ? locale : undefined,
    );
  if (locale === "en") return { formatTime };
  return {
    formatTime,
    formatWeekday: (date) => WEEKDAY_ZH.format(date),
    formatLabel: (setting, daysAhead) => {
      if (setting.kind === "after") {
        const { amount, unit } = splitSnoozeDuration(setting.minutes);
        return t("sidebar.snooze.after", {
          count: amount,
          unit: snoozeUnitLabels(amount, t)[unit],
        });
      }
      if (daysAhead === 0) {
        const hour = Number(setting.time.slice(0, 2));
        return t(
          hour < 12
            ? "sidebar.snooze.morning"
            : hour < 17
              ? "sidebar.snooze.afternoon"
              : "sidebar.snooze.evening",
        );
      }
      if (daysAhead === 1) return t("sidebar.snooze.tomorrow");
      if (setting.day === "monday") return t("sidebar.snooze.nextWeek");
      const weekday = snoozeDayLabel(setting.day, locale, t);
      return daysAhead === 7 ? t("sidebar.snooze.nextWeekday", { weekday }) : weekday;
    },
  };
}
