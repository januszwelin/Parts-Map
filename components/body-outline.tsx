"use client";

/* ════════════════════════════════════════════════════════════════════
   BODY OUTLINE SVG
   ════════════════════════════════════════════════════════════════════
   Drawn in the same 460×1000 normalized space as the region anchors, so
   nudging the config and the drawing stay aligned.

   The figure is traced from the client-supplied silhouette
   (Human_silhoutte.svg — a raster layer inside an SVG shell; its alpha
   contour was traced, simplified, smoothed to cubic Beziers, and scaled
   uniformly so the figure spans y 10–994 centered on x 230). One closed
   loop drawn as a thin calm stroke — a coordinate space, not an
   illustration. Hand/finger/groin anchors were re-tuned to this figure;
   re-tune anchors again if the drawing is ever replaced.

   Front and back render side by side as two labeled figures (front on
   the viewer's left). The back figure is the mirrored silhouette (seen
   from behind) plus a spine line and shoulder-blade hints, enough to
   read instantly as "back." */

import React from "react";
import { BODY_H, BODY_W, SPOT_R_FRAC } from "@/lib/tuning";
import { anchorToFlow, SNAP_SETS } from "@/lib/geometry";
import { BODY_PATHS, BODY_BACK_DETAIL } from "@/lib/body-paths";
import { useReducedMotion } from "@/hooks/use-media";
import type { Depth } from "@/lib/types";

const bodyStroke = {
  fill: "none",
  /* --ink resolves at runtime (:root); --color-ink is @theme-inline only. */
  stroke: "var(--ink)",
  strokeOpacity: 0.35,
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  vectorEffect: "non-scaling-stroke" as const,
};

/** One figure's line art. `back` mirrors the silhouette (seen from
 *  behind) and adds the spine/shoulder-blade hints. Prop is stable, so
 *  the memo makes this render exactly once per figure. */
const BodyArt = React.memo(function BodyArt({ back }: { back?: boolean }) {
  return (
    <svg
      viewBox="0 0 460 1000"
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, overflow: "visible" }}
      aria-hidden
    >
      <g transform={back ? "translate(460,0) scale(-1,1)" : undefined}>
        {BODY_PATHS.map((d, i) => (
          <path key={i} d={d} {...bodyStroke} />
        ))}
        {back && (
          <g opacity={0.8}>
            {BODY_BACK_DETAIL.map((d, i) => (
              <path key={i} d={d} {...bodyStroke} />
            ))}
          </g>
        )}
      </g>
    </svg>
  );
});

/** One body centered at flow 0,0 — the surface `view` selects. Both
 *  surfaces are mounted stacked and cross-faded on a flip (the outline is
 *  nearly identical mirrored, so mostly the spine/blade detail swaps).
 *  The caption underneath is interactive now and lives in
 *  figure-caption.tsx. */
export function BodyOutline({
  bodyScale,
  view,
}: {
  bodyScale: number;
  view: Depth;
}) {
  const reduced = useReducedMotion();
  const w = BODY_W * bodyScale;
  const h = BODY_H * bodyScale;
  const layer = (depth: Depth) => (
    <div
      key={depth}
      style={{
        position: "absolute",
        inset: 0,
        opacity: view === depth ? 1 : 0,
        transition: reduced ? "none" : "opacity 360ms ease",
      }}
      aria-hidden
    >
      <BodyArt back={depth === "back"} />
    </div>
  );
  return (
    <div
      style={{
        position: "absolute",
        left: -w / 2,
        top: -h / 2,
        width: w,
        height: h,
        pointerEvents: "none",
      }}
      aria-hidden
    >
      {layer("front")}
      {layer("back")}
    </div>
  );
}

/** Faint dots on every magnet-snappable anchor on both figures, shown
 *  while a part is lifted so the person can aim. Always mounted; only
 *  opacity animates (fade-out needs the DOM to still be there). */
export const AnchorConstellation = React.memo(function AnchorConstellation({
  bodyScale,
  view,
  visible,
  boost = false,
  spotRef,
}: {
  bodyScale: number;
  /** Only the shown surface's anchors are magnetic, so only they pulse. */
  view: Depth;
  visible: boolean;
  /** Tap-to-place mode: the whole vocabulary of points steps forward
   *  (the person is choosing a home, not steering a drag). */
  boost?: boolean;
  /** Spotlight circle — the drag rAF loop writes cx/cy at the steer
   *  point each frame, so guidance is local: dots near the pointer
   *  brighten, distant ones stay a whisper. */
  spotRef: React.RefObject<SVGCircleElement | null>;
}) {
  const dots = SNAP_SETS[view].map((r) => {
    const a = anchorToFlow(r, view, bodyScale);
    return (
      <circle
        key={r.key}
        cx={a.x}
        cy={a.y}
        r={2 * bodyScale}
        fill="var(--ink)"
      />
    );
  });
  return (
    <svg
      className="anchor-constellation"
      /* 1×1, not 0×0: Blink (Chrome/Edge/Opera) refuses to paint the
         overflowing children of a zero-area outer <svg> even with
         overflow:visible (Firefox paints them) — so the dots were
         invisible in every Chromium browser. A 1px viewport is enough
         to make Blink paint the overflow; positioning is unchanged
         (children are drawn at flow coords from the 0,0 origin). */
      width={1}
      height={1}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        overflow: "visible",
        opacity: visible ? 1 : 0,
        transition: "opacity 150ms ease",
        pointerEvents: "none",
      }}
      aria-hidden
    >
      <defs>
        {/* userSpaceOnUse: the svg box is 1×1 with visible overflow, so
            bounding-box units would collapse — flow units only. */}
        <clipPath id="anchor-spotlight" clipPathUnits="userSpaceOnUse">
          <circle
            ref={spotRef}
            cx={0}
            cy={0}
            r={SPOT_R_FRAC * BODY_H * bodyScale}
          />
        </clipPath>
      </defs>
      <g
        opacity={boost ? 0.22 : 0.05}
        style={{ transition: "opacity 200ms ease" }}
      >
        {dots}
      </g>
      <g opacity={0.3} clipPath="url(#anchor-spotlight)">
        {dots}
      </g>
    </svg>
  );
});
