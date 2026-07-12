"use client";

/* ════════════════════════════════════════════════════════════════════
   FIGURE CAPTION — the Front/Back control, printed under the body
   ════════════════════════════════════════════════════════════════════
   "FRONT · BACK" sits just below the figure's feet like the old
   side-by-side figure captions, but tappable — it replaces the floating
   top-center pill so nothing hovers over the canvas. The caption is
   anchored in flow coordinates (it pans with the body and follows the
   body-scale tween) but counter-scales against the viewport zoom, so it
   holds a constant on-screen size — always legible and finger-sized at
   any zoom on any device (the Figma frame-label pattern). `F` is the
   desktop fallback when the feet are off-screen. */

import React from "react";
import { useStore } from "@xyflow/react";
import { BODY_H } from "@/lib/tuning";
import { cardStyle } from "@/lib/ui";
import type { Depth } from "@/lib/types";

export const FigureCaption = React.memo(function FigureCaption({
  bodyScale,
  view,
  onFlip,
}: {
  bodyScale: number;
  view: Depth;
  onFlip: (d: Depth) => void;
}) {
  // Narrow selector: re-renders only when zoom changes (pans don't).
  const zoom = useStore((s) => s.transform[2]);
  return (
    <div
      className="nopan"
      role="group"
      aria-label="Which side of the body is shown"
      // A press here must never read as a pane pan/marquee start.
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        ...cardStyle,
        position: "absolute",
        left: 0,
        top: (BODY_H / 2 + 20) * bodyScale,
        transform: `translateX(-50%) scale(${1 / zoom})`,
        transformOrigin: "top center",
        // Under cards/edges, like the body art — a card dropped below
        // the feet paints over the caption, not vice versa.
        zIndex: -1,
        display: "flex",
        alignItems: "center",
        gap: 2,
        borderRadius: 999,
        padding: 3,
        whiteSpace: "nowrap",
        pointerEvents: "all",
        touchAction: "manipulation",
      }}
    >
      {(["front", "back"] as const).map((d) => (
        <button
          key={d}
          aria-pressed={view === d}
          aria-label={`Show the ${d} of the body`}
          className="cursor-pointer transition-colors duration-150 hover:text-ink-soft motion-reduce:transition-none"
          style={{
            fontSize: 11,
            lineHeight: 1,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "7px 14px",
            borderRadius: 999,
            background: view === d ? "rgba(125,139,116,0.16)" : "transparent",
            color: view === d ? "var(--ink)" : "var(--ink-faint)",
          }}
          onClick={() => onFlip(d)}
        >
          {d}
        </button>
      ))}
    </div>
  );
});
