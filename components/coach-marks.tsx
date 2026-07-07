"use client";

/* ════════════════════════════════════════════════════════════════════
   COACH MARKS — the guided tour ("Show me around")
   ════════════════════════════════════════════════════════════════════

   A short sequence of quiet callouts, each anchored to a real piece of
   toolbar chrome via a `data-tour="…"` attribute, with a gently bobbing
   arrow pointing at it (the `coach-bob` keyframe — same breathing cadence
   as the anchor-pulse the canvas already uses while dragging). Steps
   advance on the user actually doing the thing, not on a timer or a
   "next" button: the orchestrator hands this component a live snapshot
   of app state every render, and a step's `done()` compares it against
   the snapshot captured when the step began. This file only renders the
   callout; the step engine (the effect that watches `done()` and
   advances) lives in parts-map-app.tsx next to the state it reads. */

import { useEffect, useState, type CSSProperties } from "react";
import { panelStyle } from "@/lib/ui";

export type TourSnapshot = {
  partsCount: number;
  arrowsCount: number;
  selectedId: string | null;
  listOpen: boolean;
  exportMenuOpen: boolean;
  framedTick: number;
};

export type TourStep = {
  id: string;
  text: (s: TourSnapshot) => string;
  /** data-tour selector to anchor near, or undefined for a centered
   *  pill — used for steps whose "target" is a card on the canvas
   *  rather than a fixed piece of chrome (chasing a flow-space element
   *  around the screen would fight the drag it's trying to teach). */
  anchor: (s: TourSnapshot) => string | undefined;
  done: (snapshot: TourSnapshot, baseline: TourSnapshot) => boolean;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "add",
    anchor: () => "add",
    text: () =>
      "Name a part, then press Add — a ghost card follows your finger until you tap where it lives.",
    done: (s, b) => s.partsCount > b.partsCount,
  },
  {
    id: "edit",
    anchor: () => undefined,
    text: () => "Tap your new part to open its editor.",
    done: (s) => s.selectedId !== null,
  },
  {
    id: "link",
    anchor: () => undefined,
    text: (s) =>
      s.partsCount < 2
        ? "Add a second part, then drag a dot from one card to another to link them."
        : "Drag a dot from one card's edge to another to link them.",
    done: (s, b) => s.arrowsCount > b.arrowsCount,
  },
  {
    id: "list",
    anchor: (s) => (s.listOpen ? "export-menu" : "list"),
    text: (s) =>
      s.listOpen
        ? "Tap ⋯ to copy your list or export a flowchart."
        : "Your parts also live in the list — open it with ☰.",
    done: (s) => s.exportMenuOpen,
  },
  {
    id: "frame",
    anchor: () => "frame",
    text: () => "Lost on the canvas? This button frames your whole map.",
    done: (s, b) => s.framedTick > b.framedTick,
  },
];

/** Chrome that always deserves an above-it callout regardless of where it
 *  measures on screen: the export menu sits near the *top* of a
 *  bottom-anchored sheet on phone (its own rect can land just above the
 *  screen's vertical midpoint, which would otherwise flip the callout
 *  underneath it, straight into the sheet's list rows), and the
 *  frame-map button is a floating corner button with nothing useful
 *  below it on either layout. */
const ALWAYS_ABOVE = new Set(["export-menu", "frame"]);

export function CoachMarks({
  step,
  snapshot,
  onSkip,
}: {
  step: number;
  snapshot: TourSnapshot;
  onSkip: () => void;
}) {
  const def = TOUR_STEPS[step] as TourStep | undefined;
  const anchorKey = def?.anchor(snapshot);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const measure = () => {
      if (!anchorKey) {
        setRect(null);
        return;
      }
      const el = document.querySelector(`[data-tour="${anchorKey}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    if (!anchorKey) return;
    window.addEventListener("resize", measure);
    // The anchor can still be mid-slide when a step becomes current (the
    // list sheet sliding in to reveal its ⋯ menu) — track it for a short
    // window after any change so the callout eases in at its true final
    // spot instead of snapping to a stale mid-transition position. Costs
    // nothing once the window closes; no observer left running.
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      measure();
      if (now - start < 420) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(raf);
    };
  }, [anchorKey, step]);

  if (!def) return null;

  // Clamp against the *visible* viewport, not the layout viewport: on iOS
  // Safari window.innerWidth/innerHeight span the area behind the toolbar,
  // so a callout clamped to them can land under Safari's bars. visualViewport
  // is the actually-visible box (falls back to window on older browsers).
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const winW = vv?.width ?? (typeof window !== "undefined" ? window.innerWidth : 0);
  const winH = vv?.height ?? (typeof window !== "undefined" ? window.innerHeight : 0);
  // The anchor sits in the screen's bottom half (phone toolbar, frame-map
  // button, …) → put the callout above it, arrow pointing down at it.
  // Otherwise the callout goes below the anchor, arrow pointing up.
  const calloutAbove =
    !!anchorKey && ALWAYS_ABOVE.has(anchorKey)
      ? true
      : rect
        ? rect.top >= winH / 2
        : false;
  const style: CSSProperties = rect
    ? {
        position: "fixed",
        left: Math.min(
          Math.max(rect.left + rect.width / 2, 130),
          winW - 130,
        ),
        top: calloutAbove ? rect.top - 10 : rect.bottom + 10,
        transform: calloutAbove
          ? "translate(-50%, -100%)"
          : "translate(-50%, 0)",
      }
    : {
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      };

  const bubble = (
    <div
      className="flex max-w-[min(20rem,86vw)] items-start gap-2 rounded-2xl px-3.5 py-2.5"
      style={panelStyle}
    >
      <span className="pt-0.5 text-[13px] leading-snug" style={{ color: "var(--ink)" }}>
        {def.text(snapshot)}
      </span>
      <button
        aria-label="Skip tour"
        className="shrink-0 rounded-full px-1.5 text-xs hover:bg-black/5"
        style={{ color: "var(--ink-faint)" }}
        onClick={onSkip}
      >
        ✕
      </button>
    </div>
  );

  const arrow = rect && (
    <div
      aria-hidden
      className="coach-bob flex justify-center text-sm"
      style={{ color: "var(--ink-soft)", lineHeight: 1 }}
    >
      {calloutAbove ? "▾" : "▴"}
    </div>
  );

  return (
    <div
      key={step}
      data-ui-chrome
      className="fade-in z-40 flex flex-col items-center gap-1"
      style={style}
    >
      {calloutAbove ? (
        <>
          {bubble}
          {arrow}
        </>
      ) : (
        <>
          {arrow}
          {bubble}
        </>
      )}
    </div>
  );
}
