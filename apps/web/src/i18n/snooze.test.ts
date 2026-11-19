import { resolveSnoozePresets } from "@t3tools/client-runtime/state/thread-settled";
import type { SnoozePresetSetting } from "@t3tools/contracts/settings";
import { expect, it } from "vite-plus/test";

import { createTranslator } from "./messages";
import { snoozePresentation } from "./snooze";

it("localizes custom durations and calendar days without changing the selected wake time", () => {
  const now = new Date(2026, 10, 15, 23, 30);
  const presets = [
    { kind: "after", minutes: 90 },
    { kind: "at", day: "monday", time: "09:00" },
    { kind: "at", day: "wednesday", time: "09:00" },
  ] as const satisfies ReadonlyArray<SnoozePresetSetting>;

  const result = resolveSnoozePresets(now, {
    presets,
    ...snoozePresentation("24-hour", "zh-CN", createTranslator("zh-CN")),
  });
  expect(result.map(({ label }) => label)).toEqual([
    "90 \u5206\u949f\u540e",
    "\u660e\u5929",
    "\u5468\u4e09",
  ]);
  expect(result[0]?.whenLabel).toMatch(/^\u5468\u4e00 0?1:00$/);
  expect(result.map(({ snoozedUntil }) => snoozedUntil)).toEqual(
    resolveSnoozePresets(now, { presets }).map(({ snoozedUntil }) => snoozedUntil),
  );
});
