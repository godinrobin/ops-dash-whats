import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/lib/utils";

type ScrollAreaOrientation = "vertical" | "horizontal" | "both";

type ScrollAreaProps = React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
  /**
   * Which scrollbar(s) to render. Defaults to "both" to preserve existing behavior.
   * Use "vertical" to prevent horizontal scrolling in narrow layouts.
   */
  orientation?: ScrollAreaOrientation;

  /**
   * When true, adds padding to the viewport so content never sits underneath
   * Radix's overlay scrollbars.
   */
  withScrollbarPadding?: boolean;
};

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(({ className, children, orientation = "both", withScrollbarPadding = false, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
    <ScrollAreaPrimitive.Viewport
      className={cn(
        "h-full w-full rounded-[inherit]",
        orientation === "vertical" && "overflow-x-hidden",
        orientation === "horizontal" && "overflow-y-hidden",

        // Reserve space so content doesn't get visually cut by the overlay scrollbar.
        withScrollbarPadding && (orientation === "vertical" || orientation === "both") && "pr-3",
        withScrollbarPadding && (orientation === "horizontal" || orientation === "both") && "pb-3",
      )}
    >
      {children}
    </ScrollAreaPrimitive.Viewport>

    {(orientation === "vertical" || orientation === "both") && <ScrollBar orientation="vertical" />}
    {(orientation === "horizontal" || orientation === "both") && <ScrollBar orientation="horizontal" />}
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
