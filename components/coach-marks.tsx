"use client";

/* ════════════════════════════════════════════════════════════════════
   COACH MARKS — the guided tour ("Show me around")
   ════════════════════════════════════════════════════════════════════

   A short sequence of quiet callouts, each anchored to a real target —
   toolbar chrome via a `data-tour="…"` attribute, or a canvas card via
   the `node:<partId>` anchor convention. The rest of the screen dims
   behind a soft spotlight cutout around the target (the overlay itself
   is pointer-events: none), with a breathing accent ring naming the
   touchable thing. Steps advance on the user actually doing the thing,
   not on a timer or a "next" button: the orchestrator hands this
   component a live snapshot of app state every render, and a step's
   `done()` compares it against the snapshot captured when the step
   began. On desktop the tour is purely action-gated — every tap still
   lands on the real UI. On phone the steps carry `allow` lists and the
   orchestrator mounts useTourLock, so only the step's target (and Skip)
   is touchable. This file only renders the callout; the step engine
   (the effect that watches `done()` and advances, plus the camera
   choreography and the lock) lives in parts-map-app.tsx next to the
   state it reads. */

import { useEffect, useState, type CSSProperties } from "react";
import { cardStyle, panelStyle } from "@/lib/ui";

export type TourSnapshot = {
  partsCount: number;
  arrowsCount: number;
  /** Parts sitting on the body (not off-body) — the place step completes
   *  when this rises. */
  onBodyCount: number;
  /** The most recently added part, so steps can anchor to its card. */
  lastAddedId: string | null;
  selectedId: string | null;
  listOpen: boolean;
  exportMenuOpen: boolean;
  framedTick: number;
  /** The phone Create sheet is up — the locked phone tour's add steps
   *  complete when it opens, and its name steps live inside it. */
  createSheetOpen: boolean;
  /** Steps read this to phrase phone-specific instructions — on phone,
   *  arrows are drawn from the edit sheet's Draw-arrow field (the connect
   *  dots need a selection, and selecting covers the card with the sheet). */
  isPhone: boolean;
};

/** Which phone surface a step's anchor lives in — the orchestrator shows
 *  a sheet-anchored callout only while that sheet is the covering surface. */
export type TourSurface = "create" | "edit" | "list" | null;

export type TourStep = {
  id: string;
  text: (s: TourSnapshot) => string;
  /** Anchor to spotlight: a `data-tour="…"` key for chrome, or
   *  `node:<partId>` for a canvas card (resolved via React Flow's
   *  `data-id`). Undefined → centered pill, no spotlight (only transient
   *  states hit this now, e.g. before the first part exists). */
  anchor: (s: TourSnapshot) => string | undefined;
  done: (snapshot: TourSnapshot, baseline: TourSnapshot) => boolean;
  /** Locked phone tour only — CSS selectors the user may touch during
   *  this step (the coach-marks callout itself is always allowed). Steps
   *  without an allow list leave the UI fully interactive (desktop tour). */
  allow?: (s: TourSnapshot) => string[];
  /** Containers whose native scrolling stays live even though their
   *  controls are blocked (e.g. the edit sheet during the link step). */
  scrollWithin?: (s: TourSnapshot) => string[];
  /** The phone surface this step's anchor lives in (see TourSurface). */
  sheet?: (s: TourSnapshot) => TourSurface;
  /** The step's action came undone (e.g. the Create sheet was dismissed
   *  without naming) — the engine steps back one. */
  regress?: (snapshot: TourSnapshot, baseline: TourSnapshot) => boolean;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "add",
    anchor: () => "add",
    // Layout-neutral: the anchor is the Add button on desktop and the +
    // button on phone (both carry data-tour="add"); phone reveals a name
    // field in the Create sheet first.
    text: () => "Add your first part — give it a name.",
    done: (s, b) => s.partsCount > b.partsCount,
  },
  {
    // The signature interaction, taught explicitly: the step only
    // completes when the part actually lands on a body point. The
    // orchestrator glides the camera to the fresh card on entry.
    id: "place",
    anchor: (s) => (s.lastAddedId ? `node:${s.lastAddedId}` : undefined),
    text: () => "Drag the card onto the body — it snaps to the nearest point.",
    done: (s, b) => s.onBodyCount > b.onBodyCount,
  },
  {
    id: "edit",
    anchor: (s) => (s.lastAddedId ? `node:${s.lastAddedId}` : undefined),
    text: () => "Tap the card to open its editor — color, notes, location.",
    done: (s) => s.selectedId !== null,
  },
  {
    id: "link",
    anchor: (s) =>
      s.partsCount < 2
        ? "add"
        : s.lastAddedId
          ? `node:${s.lastAddedId}`
          : undefined,
    text: (s) =>
      s.isPhone
        ? s.partsCount < 2
          ? "Add a second part, then open a card and use “Draw arrow” to link them."
          : "Open a card and use “Draw arrow” to link two parts."
        : s.partsCount < 2
          ? "Add a second part, then drag a dot from one card to another to link them."
          : "Drag a dot from one card's edge to another to link them.",
    done: (s, b) => s.arrowsCount > b.arrowsCount,
  },
  {
    id: "list",
    anchor: (s) => (s.listOpen ? "export-menu" : "list"),
    text: (s) =>
      s.listOpen
        ? "Tap ⋯ for share & export options."
        : "Your parts also live in the list — open it with the list button.",
    done: (s) => s.exportMenuOpen,
  },
  {
    id: "frame",
    anchor: () => "frame",
    text: () => "Lost on the canvas? This button frames your whole map.",
    done: (s, b) => s.framedTick > b.framedTick,
  },
];

/** The locked phone tour ("Show me around" on a phone): the same watch-
 *  the-state engine, but each step also *locks* the rest of the UI — the
 *  orchestrator feeds every step's `allow` list to useTourLock, so the
 *  only touchable things are the step's target and the Skip button. It
 *  walks the full first-map arc: add + name + place twice, meet the
 *  editor, draw an arrow from it, then the list and frame-map chrome. */
export const PHONE_TOUR_STEPS: TourStep[] = [
  {
    id: "add",
    anchor: () => "add",
    // Count-aware: "Explore an example" runs this same flow on a
    // populated sample map, where "your first part" would read wrong.
    text: (s) =>
      s.partsCount > 0 ? "Tap + to add a part." : "Tap + to add your first part.",
    done: (s) => s.createSheetOpen,
    allow: () => ['[data-tour="add"]'],
  },
  {
    id: "name",
    anchor: () => "create-name",
    sheet: () => "create",
    text: () => "Name the part, then tap Add.",
    done: (s, b) => s.partsCount > b.partsCount,
    // Dismissing the sheet is deliberately allowed — the regress rule is
    // the recovery (back to the + step, nothing created).
    allow: () => [
      '[data-tour="create-name"]',
      '[data-tour="create-add"]',
      "[data-sheet-dismiss]",
    ],
    regress: (s, b) => !s.createSheetOpen && s.partsCount === b.partsCount,
  },
  {
    id: "place",
    anchor: (s) => (s.lastAddedId ? `node:${s.lastAddedId}` : undefined),
    text: () => "Drag the card onto the body — it snaps to the nearest point.",
    // Completion includes the auto-select (the orchestrator opens the
    // editor after the landing settles) so the next step's baseline
    // captures a non-null selection — its "closed the editor" done can't
    // fire on entry.
    done: (s, b) => s.onBodyCount > b.onBodyCount && s.selectedId !== null,
    allow: (s) =>
      s.lastAddedId
        ? [`.react-flow__node[data-id="${CSS.escape(s.lastAddedId)}"]`]
        : [],
  },
  {
    id: "edit",
    anchor: () => "edit-sheet",
    sheet: () => "edit",
    text: () =>
      "This is the part's editor — colour, notes, location and more. Tap Done, or the space above, when you're finished.",
    done: (s) => s.selectedId === null,
    // The scrim carries data-sheet-dismiss — that's the "space above".
    allow: () => ['[data-tour="edit-sheet"]', "[data-sheet-dismiss]"],
  },
  {
    id: "add2",
    anchor: () => "add",
    text: (s) =>
      s.partsCount === 1
        ? "Tap + again — a second part."
        : "Tap + again — add another part.",
    done: (s) => s.createSheetOpen,
    allow: () => ['[data-tour="add"]'],
  },
  {
    id: "name2",
    anchor: () => "create-name",
    sheet: () => "create",
    text: () => "Name this one too, then tap Add.",
    done: (s, b) => s.partsCount > b.partsCount,
    allow: () => [
      '[data-tour="create-name"]',
      '[data-tour="create-add"]',
      "[data-sheet-dismiss]",
    ],
    regress: (s, b) => !s.createSheetOpen && s.partsCount === b.partsCount,
  },
  {
    id: "place2",
    anchor: (s) => (s.lastAddedId ? `node:${s.lastAddedId}` : undefined),
    text: () => "Drag this card onto the body too.",
    done: (s, b) => s.onBodyCount > b.onBodyCount && s.selectedId !== null,
    allow: (s) =>
      s.lastAddedId
        ? [`.react-flow__node[data-id="${CSS.escape(s.lastAddedId)}"]`]
        : [],
  },
  {
    id: "link",
    anchor: () => "connect",
    sheet: () => "edit",
    text: () =>
      "Draw your first arrow — pick the other part under “Draw arrow to…”.",
    done: (s, b) => s.arrowsCount > b.arrowsCount,
    // Only the connect field acts; the sheet still scrolls so short
    // screens can reach it. No dismiss selectors — losing the sheet here
    // (Escape) is recovered by the orchestrator's auto-reselect.
    allow: () => ['[data-tour="connect"]'],
    scrollWithin: () => ['[data-tour="edit-sheet"]'],
  },
  {
    id: "list",
    anchor: (s) => (s.listOpen ? "export-menu" : "list"),
    sheet: (s) => (s.listOpen ? "list" : null),
    text: (s) =>
      s.listOpen
        ? "Tap ⋯ for share & export options."
        : "Your parts also live in the list — open it with ☰.",
    done: (s) => s.exportMenuOpen,
    allow: (s) =>
      s.listOpen
        ? ['[data-tour="export-menu"]', "[data-sheet-dismiss]"]
        : ['[data-tour="list"]'],
  },
  {
    id: "frame",
    anchor: () => "frame",
    text: () => "Lost on the canvas? This button frames your whole map.",
    done: (s, b) => s.framedTick > b.framedTick,
    allow: () => ['[data-tour="frame"]'],
  },
];

/** Chrome that always deserves an above-it callout regardless of where it
 *  measures on screen: the export menu, create-name field and connect
 *  select all sit inside bottom-anchored sheets on phone (their rects can
 *  land just above the screen's vertical midpoint, which would otherwise
 *  flip the callout underneath them, straight into the sheet's rows); the
 *  edit-sheet anchor IS the sheet, so below it is off-screen; and the
 *  frame-map button is a floating corner button with nothing useful
 *  below it on either layout. */
const ALWAYS_ABOVE = new Set([
  "export-menu",
  "frame",
  "edit-sheet",
  "create-name",
  "connect",
]);

export function CoachMarks({
  steps,
  step,
  snapshot,
  onSkip,
  nudgeKey,
}: {
  steps: TourStep[];
  step: number;
  snapshot: TourSnapshot;
  onSkip: () => void;
  /** Bumped by the orchestrator when the lock guard swallows a tap —
   *  replays a small pulse on the bubble so the block reads as
   *  intentional guidance, not a broken button. */
  nudgeKey?: number;
}) {
  const def = steps[step] as TourStep | undefined;
  const anchorKey = def?.anchor(snapshot);
  const [rect, setRect] = useState<DOMRect | null>(null);
  // A nudge is transient: the class (and the remount key that replays the
  // animation) clears after the pulse, so a later step change doesn't
  // accidentally replay it.
  const [nudge, setNudge] = useState<number | null>(null);
  useEffect(() => {
    if (!nudgeKey) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNudge(nudgeKey);
    const t = setTimeout(() => setNudge(null), 450);
    return () => clearTimeout(t);
  }, [nudgeKey]);

  useEffect(() => {
    const measure = () => {
      if (!anchorKey) {
        setRect(null);
        return;
      }
      // Chrome anchors carry data-tour; `node:<id>` anchors resolve to the
      // part's React Flow card (its wrapper carries data-id). Both layouts
      // can carry the same data-tour key (desktop toolbar + phone quick
      // tools) and the hidden one measures 0×0 — take the visible match,
      // never just the first in DOM order.
      const els = anchorKey.startsWith("node:")
        ? [
            document.querySelector(
              `.react-flow__node[data-id="${CSS.escape(anchorKey.slice(5))}"]`,
            ),
          ]
        : [...document.querySelectorAll(`[data-tour="${anchorKey}"]`)];
      // Besides the 0×0 filter, require the rect to intersect the visible
      // viewport: the bottom sheets stay mounted while closed (translated
      // just below the screen), so a closed sheet's anchor still measures
      // a real size — off-screen.
      const vv2 = window.visualViewport;
      const vw = vv2?.width ?? window.innerWidth;
      const vh = vv2?.height ?? window.innerHeight;
      const visible = els
        .map((e) => e?.getBoundingClientRect())
        .find(
          (r) =>
            r &&
            r.width > 0 &&
            r.height > 0 &&
            r.bottom > 0 &&
            r.right > 0 &&
            r.top < vh &&
            r.left < vw,
        );
      setRect(visible ?? null);
    };
    measure();
    if (!anchorKey) return;
    window.addEventListener("resize", measure);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", measure);
    // The anchor can still be mid-motion when a step becomes current (the
    // list sheet sliding in to reveal its ⋯; the camera gliding to a fresh
    // card, 380ms; a drop settling, ~320ms) — track it for a short window
    // after any change so the callout eases in at its true final spot
    // instead of snapping to a stale mid-transition position. Costs
    // nothing once the window closes; no observer left running.
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      measure();
      if (now - start < 800) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("resize", measure);
      vv?.removeEventListener("resize", measure);
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
  // Keep the bubble fully on-screen: clamp its center by its MAX half-width
  // (max-w below is min(20rem, 86vw), so this is a known constant — a
  // measured width would lag a render behind and let a corner anchor pull
  // the bubble off-screen), then offset the arrow by however far the clamp
  // pulled the bubble off the anchor — so the arrow still lands on the
  // target even when it sits in a screen corner.
  const anchorCenterX = rect ? rect.left + rect.width / 2 : 0;
  const half = Math.min(320, winW * 0.86) / 2 + 8;
  const bubbleLeft = Math.min(Math.max(anchorCenterX, half), winW - half);
  const arrowDX = Math.max(
    -(half - 16),
    Math.min(half - 16, anchorCenterX - bubbleLeft),
  );
  const style: CSSProperties = rect
    ? {
        position: "fixed",
        left: bubbleLeft,
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
      key={nudge ?? "still"}
      className={`flex max-w-[min(20rem,86vw)] flex-col rounded-2xl px-3.5 py-2.5 ${
        nudge !== null ? "coach-nudge" : ""
      }`}
      style={snapshot.isPhone ? panelStyle : cardStyle}
    >
      <span className="text-[13px] leading-snug" style={{ color: "var(--ink)" }}>
        {def.text(snapshot)}
      </span>
      <div className="flex items-center justify-between gap-3 pt-1.5">
        <div
          className="flex items-center gap-1.5"
          role="img"
          aria-label={`Step ${step + 1} of ${steps.length}`}
        >
          {steps.map((s, i) => (
            <span
              key={s.id}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: i <= step ? "var(--accent)" : "var(--line)" }}
            />
          ))}
        </div>
        <button
          aria-label="Skip tour"
          className="-mr-1.5 rounded-full px-2 py-0.5 text-[11px] hover:bg-black/5 active:bg-black/10 pointer-coarse:min-h-11"
          style={{ color: "var(--ink-faint)" }}
          onClick={onSkip}
        >
          Skip
        </button>
      </div>
    </div>
  );

  const arrow = rect && (
    // Outer wrapper carries the horizontal offset; the inner element keeps
    // the coach-bob animation (which owns `transform`, so the two can't share
    // one element without the bob clobbering the offset).
    <div aria-hidden style={{ transform: `translateX(${arrowDX}px)` }}>
      <div
        className="coach-bob flex justify-center text-sm"
        style={{ color: "var(--ink-soft)", lineHeight: 1 }}
      >
        {calloutAbove ? "▾" : "▴"}
      </div>
    </div>
  );

  // Spotlight: a soft-edged cutout in a light dim around the target, plus
  // a breathing accent ring. Pure visual — pointer-events: none, so every
  // tap still lands on the real UI (the tour is action-gated).
  const SPOT_PAD = 10;
  const spotRx = rect ? Math.min(24, (rect.height + SPOT_PAD * 2) / 2) : 0;
  const spotlight = rect && (
    <div
      aria-hidden
      data-ui-chrome
      className="pointer-events-none fixed inset-0 z-40 fade-in"
    >
      <svg width="100%" height="100%">
        <defs>
          <filter id="coach-spot-soften" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <mask id="coach-spot-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
            <rect
              x={rect.left - SPOT_PAD}
              y={rect.top - SPOT_PAD}
              width={rect.width + SPOT_PAD * 2}
              height={rect.height + SPOT_PAD * 2}
              rx={spotRx}
              fill="#000"
              filter="url(#coach-spot-soften)"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(58,55,51,0.16)"
          mask="url(#coach-spot-mask)"
        />
      </svg>
      <div
        className="coach-spot absolute"
        style={{
          left: rect.left - SPOT_PAD,
          top: rect.top - SPOT_PAD,
          width: rect.width + SPOT_PAD * 2,
          height: rect.height + SPOT_PAD * 2,
          borderRadius: spotRx,
          border: "1.5px solid var(--accent)",
          transformOrigin: "center",
        }}
      />
    </div>
  );

  return (
    <>
      {spotlight}
      <div
        key={step}
        data-ui-chrome
        data-coach-marks
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
    </>
  );
}
