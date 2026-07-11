"use client";

/* ════════════════════════════════════════════════════════════════════
   TOUR LOCK — the locked phone tour's input guard.

   While a locked step is active, document-level capture listeners gate
   every interaction *initiation* (pointerdown / touchstart / mousedown)
   plus click, so the only touchable things are the step's `allow`
   selectors and the coach-marks callout (Skip). Everything else is
   swallowed before React Flow, the sheets, or any button can see it —
   and a throttled onBlocked lets the callout pulse so a blocked tap
   reads as guidance, not a dead button.

   Deliberately initiation-only: an allowed drag, once started, must be
   untouchable (the lift/magnet/camera choreography rides pointermove/up),
   and RF's pan/zoom and the sheets' swipe all *begin* on pointerdown, so
   gating starts is sufficient. Blocking `click` separately is what
   disarms buttons for keyboard activation too (Enter/Space synthesize
   clicks). No keydown handling: Escape's consequences are absorbed by
   the engine's regress/auto-reselect rules.

   Marker attributes (checked in this order):
   • [data-tour-deny]     — always blocked, even inside an allowed region
                            (the edit sheet's Delete during the tour).
   • [data-coach-marks]   — always allowed (the callout + Skip).
   • [data-tour-allow]    — always allowed regardless of step (the notice
                            pill: its auto-space Undo and tap-to-dismiss
                            must never read as dead).
   • `allow` selectors    — the step's touchable target(s).
   • [data-sheet-dismiss] — a sheet's scrim/grab-strip; blocked unless the
                            step allows it explicitly (dismissal is opt-in).
   • `scrollWithin`       — containers whose native scrolling stays live:
                            events are stopped from reaching handlers but
                            not prevented, except on form controls (focus
                            would summon the keyboard).

   Nothing in the DOM is mutated — disabling the guard restores the whole
   UI by construction.
   ════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef } from "react";

const INITIATION = ["pointerdown", "touchstart", "mousedown"] as const;

export function useTourLock({
  enabled,
  allow,
  scrollWithin,
  onBlocked,
}: {
  enabled: boolean;
  allow: string[];
  scrollWithin?: string[];
  onBlocked?: () => void;
}) {
  // Refs, not deps: the listeners must not detach/reattach on every
  // snapshot-driven allow-list rebuild mid-gesture.
  const allowRef = useRef(allow);
  const scrollRef = useRef(scrollWithin);
  const onBlockedRef = useRef(onBlocked);
  useEffect(() => {
    allowRef.current = allow;
    scrollRef.current = scrollWithin;
    onBlockedRef.current = onBlocked;
  });
  const lastNudgeRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const matchesAny = (el: Element, sels: string[] | undefined) =>
      !!sels?.some((s) => {
        try {
          return !!el.closest(s);
        } catch {
          return false; // a malformed selector must never unlock the UI
        }
      });
    const isAllowed = (el: Element) =>
      !el.closest("[data-tour-deny]") &&
      (!!el.closest("[data-coach-marks]") ||
        !!el.closest("[data-tour-allow]") ||
        matchesAny(el, allowRef.current));

    const nudge = () => {
      const now = Date.now();
      if (now - lastNudgeRef.current < 350) return;
      lastNudgeRef.current = now;
      onBlockedRef.current?.();
    };

    const onInitiation = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (isAllowed(t)) return;
      // Dismiss surfaces are opt-in per step — when not allowed, they
      // fall through to the plain block below.
      if (
        !t.closest("[data-sheet-dismiss]") &&
        !t.closest("[data-tour-deny]") &&
        matchesAny(t, scrollRef.current)
      ) {
        // Inside a scroll-live container: keep native scrolling (no
        // preventDefault) but starve every JS handler; form controls do
        // get preventDefault so they can't take focus and summon the
        // keyboard.
        e.stopPropagation();
        if (t.closest("input,textarea,select,button,[role='button']"))
          e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "pointerdown") nudge();
    };

    const onClick = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (isAllowed(t)) return;
      e.preventDefault();
      e.stopPropagation();
    };

    const opts: AddEventListenerOptions = { capture: true, passive: false };
    for (const type of INITIATION)
      document.addEventListener(type, onInitiation, opts);
    document.addEventListener("click", onClick, opts);
    return () => {
      for (const type of INITIATION)
        document.removeEventListener(type, onInitiation, opts);
      document.removeEventListener("click", onClick, opts);
    };
  }, [enabled]);
}
