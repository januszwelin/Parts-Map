"use client";

/* ════════════════════════════════════════════════════════════════════
   BOTTOM SHEET — the shared phone-sheet shell: a frosted card anchored
   to the bottom edge, with a grab strip that swipes it away and the
   same 320ms slide the app uses everywhere. Extracted from the pattern
   the edit sheet and parts-list sheet had each duplicated inline.

   The shell owns only the frame + gesture; each sheet supplies its own
   header/Done and body as children. Always mounted so the slide in/out
   can animate; `pointerEvents` follows `open` so a hidden sheet never
   swallows canvas taps. Visibility is gated by the callers' useIsPhone()
   — deliberately no CSS breakpoint here: a coarse landscape phone can be
   ≥640px wide and still needs its sheets (the old `sm:hidden` left those
   devices with no editor at all).

   An open sheet dims the canvas + chrome behind it with a light scrim
   (Miro's mobile language); a tap on the dim puts the sheet away. Layer
   map: canvas < chrome z-20 < scrim z-30 < sheet z-30 (DOM order) <
   notice pill z-30 (renders after the sheets) < Import/MyMaps < Welcome
   and coach marks z-40. Sheets stay aria-modal={false} — the scrim is a
   visual + tap layer, not a focus trap.
   ════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState, type RefObject } from "react";
import { panelStyle } from "@/lib/ui";
import { useReducedMotion } from "@/hooks/use-media";
import { haptic } from "@/lib/haptics";

/** Space always left clear above a sheet, so short viewports (landscape
 *  phones) and keyboard lifts never let the sheet smother the top chrome
 *  — 88px covers the desktop toolbar band, the safe-area term covers the
 *  phone top bar under a notch. */
const HEADROOM = "max(88px, calc(64px + env(safe-area-inset-top)))";

/** iOS-keyboard inset: iOS Safari overlays the on-screen keyboard without
 *  resizing the layout viewport (`interactive-widget` is Chromium-only),
 *  so a bottom-anchored sheet's lower fields disappear behind it. While a
 *  form field inside the sheet has focus, lift the sheet by the keyboard's
 *  overlap. Gated on that focus so page pinch-zoom (which also shrinks the
 *  visual viewport) never moves the sheet; on Chromium the formula itself
 *  cancels out (innerHeight shrinks along with vv.height). The lift is a
 *  plain `bottom` offset — the slide/swipe own `transform` — and instant,
 *  which tracks the keyboard animation least-worst and needs no
 *  reduced-motion gate. */
function useKeyboardInset(
  sheetRef: RefObject<HTMLDivElement | null>,
  open: boolean,
) {
  const [inset, setInset] = useState(0);
  // Reset as the sheet closes — a render-time adjustment (guarded, so it
  // can't loop) instead of a setState inside the effect body below.
  if (!open && inset !== 0) setInset(0);
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const el = document.activeElement;
      const fieldFocused =
        !!el &&
        sheetRef.current?.contains(el) === true &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      setInset(
        fieldFocused
          ? Math.max(
              0,
              Math.round(window.innerHeight - vv.height - vv.offsetTop),
            )
          : 0,
      );
    };
    // focusout fires before focus reaches the next field — re-check after
    // the hop settles so moving between fields doesn't bounce the sheet.
    const settleUpdate = () => {
      clearTimeout(settle);
      settle = setTimeout(update, 50);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", settleUpdate);
    return () => {
      clearTimeout(settle);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", settleUpdate);
    };
  }, [open, sheetRef]);
  return inset;
}

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
  /** Optional `data-tour` key stamped on the sheet card, so the guided
   *  tour can anchor to (and allow-list) a whole sheet. */
  tourId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onBeforeClose?: () => void;
  maxHeight?: string;
  label?: string;
  tourId?: string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y0: number; dy: number } | null>(null);
  const keyboardInset = useKeyboardInset(sheetRef, open);
  /** The slide, in one place: the style prop AND the grab-end restore must
   *  write the SAME value. Restoring `""` here once removed the transition
   *  for good — it only exists as an inline style whose value never
   *  changes, so React's per-property diff never re-wrote it, and every
   *  sheet snapped instead of sliding after its first grab-strip touch. */
  const slideTransition = reduced
    ? "none"
    : "transform 320ms cubic-bezier(0.32, 0.72, 0.22, 1)";

  // Hand keyboard focus back where it came from when the sheet is put
  // away — but only if focus is still inside the sheet (a pane tap that
  // closed it already moved the user's attention; don't yank it back).
  // The blur() fallback guarantees the iOS keyboard drops on dismiss.
  const restoreRef = useRef<Element | null>(null);
  const wasOpenRef = useRef(open);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      restoreRef.current = document.activeElement;
    } else if (!open && wasOpenRef.current) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && sheetRef.current?.contains(active)) {
        const r = restoreRef.current;
        if (
          r instanceof HTMLElement &&
          r.isConnected &&
          !sheetRef.current.contains(r)
        ) {
          r.focus({ preventScroll: true });
        } else {
          active.blur();
        }
      }
      restoreRef.current = null;
    }
    wasOpenRef.current = open;
  }, [open]);

  // A closed sheet is parked just below the screen, still mounted for the
  // slide — `inert` keeps hardware-keyboard focus and assistive tech out
  // of it (pointerEvents alone only stops pointers). Applied as an effect
  // DECLARED AFTER the focus-restore effect above: committing `inert` as
  // a JSX prop would blur the sheet's focused field before that effect
  // could read activeElement, silently breaking restore. (inert doesn't
  // pause CSS transitions, so the slide-out is unaffected.)
  useEffect(() => {
    const el = sheetRef.current;
    if (el) el.inert = !open;
  }, [open]);

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
    // Restore the exact slide value (not "") so the DOM and React's prop
    // record agree — see slideTransition above.
    s.style.transition = slideTransition;
    s.style.transform = "";
    if (d && d.dy > 80) {
      // A committed dismissal gets a faint confirming tick, like the
      // other put-away gestures.
      haptic(3);
      onBeforeClose?.();
      onClose();
    }
  };

  return (
    <>
      {/* Scrim — a sibling of the card, never a child: panelStyle's
          backdrop-filter makes the card a containing block that would
          trap an inset-0 layer inside it. */}
      <div
        data-ui-chrome
        data-sheet-dismiss
        aria-hidden
        className="absolute inset-0 z-30"
        style={{
          background: "rgba(58,55,51,0.14)",
          opacity: open ? 1 : 0,
          transition: reduced
            ? "none"
            : "opacity 320ms cubic-bezier(0.32, 0.72, 0.22, 1)",
          pointerEvents: open ? "auto" : "none",
        }}
        onPointerDown={() => {
          onBeforeClose?.();
          onClose();
        }}
      />
      <div
        ref={sheetRef}
        data-ui-chrome
        data-tour={tourId}
        role="dialog"
        aria-modal={false}
        aria-hidden={!open}
        aria-label={label}
        className="absolute inset-x-0 z-30 flex flex-col rounded-t-3xl px-4"
        style={{
          ...panelStyle,
          boxShadow: "0 -8px 32px rgba(60, 50, 40, 0.16)",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          bottom: keyboardInset,
          maxHeight:
            keyboardInset > 0
              ? `min(${maxHeight}, calc(100dvh - ${keyboardInset}px - ${HEADROOM}))`
              : `min(${maxHeight}, calc(100dvh - ${HEADROOM}))`,
          transform: open ? "translateY(0)" : "translateY(112%)",
          transition: slideTransition,
          touchAction: "manipulation",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* grab strip — the whole top edge is the swipe handle */}
        <div
          data-sheet-dismiss
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
    </>
  );
}
