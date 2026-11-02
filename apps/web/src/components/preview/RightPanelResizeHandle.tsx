import type { ComponentProps } from "react";
import type { ResizableWidthHandlers } from "~/hooks/useResizableWidth";
import { cn } from "~/lib/utils";

interface Props extends Pick<
  ComponentProps<"div">,
  "tabIndex" | "onKeyDown" | "aria-valuenow" | "aria-valuemin" | "aria-valuemax"
> {
  handlers: ResizableWidthHandlers;
  className?: string;
  label?: string;
  /** Which edge of the panel the handle sits on; the panel grows from there. */
  side?: "left" | "right";
}

/**
 * Hit target for resizing a side-anchored panel via its inner edge.
 *
 * Sits on top of the panel's border with a 4px overlap on each side so the
 * user can grab a few pixels off the edge without aiming. The indicator is a
 * 1px line that lights up on hover or active.
 */
export function RightPanelResizeHandle({
  handlers,
  className,
  label,
  side = "left",
  ...separatorProps
}: Props) {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      {...separatorProps}
      className={cn(
        "group absolute inset-y-0 z-20 w-2 cursor-col-resize select-none",
        side === "left" ? "-left-1" : "-right-1",
        className,
      )}
      {...handlers}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-150 group-hover:bg-border group-focus-visible:bg-primary/60 group-active:bg-primary/60"
      />
    </div>
  );
}
