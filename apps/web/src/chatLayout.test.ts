import { describe, expect, it } from "vite-plus/test";

import { CHAT_COLUMN_MIN_WIDTH_PX, inlineRightPanelSizeStyle } from "./chatLayout";

describe("chat layout sizing", () => {
  it("reserves the minimum chat width when sizing the inline right panel", () => {
    expect(inlineRightPanelSizeStyle(1200)).toEqual({
      width: "1200px",
      maxWidth: `calc(100% - ${CHAT_COLUMN_MIN_WIDTH_PX}px)`,
    });
    expect(CHAT_COLUMN_MIN_WIDTH_PX).toBe(400);
  });
});
