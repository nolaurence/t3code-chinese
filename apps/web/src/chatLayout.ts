export const CHAT_COLUMN_MIN_WIDTH_PX = 400;

export function inlineRightPanelSizeStyle(width: number): {
  readonly width: string;
  readonly maxWidth: string;
} {
  return {
    width: `${width}px`,
    maxWidth: `calc(100% - ${CHAT_COLUMN_MIN_WIDTH_PX}px)`,
  };
}
