import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

export type RightPanelSide = "left" | "right";

const RIGHT_PANEL_SIDE_STORAGE_KEY = "t3code:right-panel-side";
const RightPanelSideSchema = Schema.Union([Schema.Literal("left"), Schema.Literal("right")]);

/**
 * Which side of the chat column the inline right panel docks to, persisted
 * per browser. The sheet layout (narrow viewports) is an overlay and ignores it.
 */
export function useRightPanelSide(): readonly [RightPanelSide, (side: RightPanelSide) => void] {
  return useLocalStorage(RIGHT_PANEL_SIDE_STORAGE_KEY, "right", RightPanelSideSchema);
}
