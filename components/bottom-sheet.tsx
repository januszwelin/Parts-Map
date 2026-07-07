"use client";

/* ════════════════════════════════════════════════════════════════════
   BOTTOM SHEET — the shared phone-sheet shell: a frosted card anchored
   to the bottom edge, with a grab strip that swipes it away and the
   same 320ms slide the app uses everywhere. Extracted from the pattern
   the edit sheet and parts-list sheet had each duplicated inline.

   The shell owns only the frame + gesture; each sheet supplies its own
   header/Done and body as children. Always mounted so the slide in/out
   can animate; `pointerEvents` follows `open` so a hidden sheet never
   swallows canvas taps.
   ════════════════════════════════════════════════════════════════════ */

import { useRef } from "react";
import { panelStyle } from "@/lib/ui";
import { useReducedMotion } from "@/hooks/use-media";

export function BottomSheet({
  open,
  onClose,
  /** Runs synchronously right before a swipe-dismiss calls `onClose` —
   *  the edit sheet uses it to flush pending field edits. */
  onBeforeClose,
  /** 62dvh for lists/menus; 85dvh where a text field summons the iOS
   *  keyboard (which overlays without resizing the layout viewport). */
  maxHeight = "62dvh",
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onBeforeClose?: () => void;
  maxHeight?: string;
  label?: string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y0: number; dy: number } | null>(null);

  // Swipe-to-dismiss: the grab strip follows the finger (down only);
  // past ~80px the sheet is put away, otherwise it springs home.
  const onGrabDown = (e: React.PointerEvent) => {
    dragRef.current = { y0: e.clientY, dy: 0 };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  };
  const onGrabMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onGrabUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    const s = sheetRef.current;
    if (!s) return;
    // Clearing the inline overrides hands the slide back to the CSS
    // (or, under reduced motion, to the instant `transition: none`).
    s.style.transition = "";
    s.style.transform = "";
    if (d && d.dy > 80) {
      onBeforeClose?.();
      onClose();
    }
  };

  return (
    <div
      ref={sheetRef}
      data-ui-chrome
      role="dialog"
      aria-modal={false}
      aria-label={label}
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-3xl px-4 sm:hidden"
      style={{
        ...panelStyle,
        boxShadow: "0 -8px 32px rgba(60, 50, 40, 0.16)",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        maxHeight,
        transform: open ? "translateY(0)" : "translateY(112%)",
        transition: reduced
          ? "none"
          : "transform 320ms cubic-bezier(0.32, 0.72, 0.22, 1)",
        touchAction: "manipulation",
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {/* grab strip — the whole top edge is the swipe handle */}
      <div
        className="-mx-4 flex shrink-0 cursor-grab justify-center pb-1 pt-2"
        style={{ touchAction: "none" }}
        onPointerDown={onGrabDown}
        onPointerMove={onGrabMove}
        onPointerUp={onGrabUp}
        onPointerCancel={onGrabUp}
      >
        <div
          className="h-1.5 w-10 rounded-full"
          style={{ background: "var(--line)" }}
        />
      </div>
      {children}
    </div>
  );
}
