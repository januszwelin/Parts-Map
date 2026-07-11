"use client";

/* ════════════════════════════════════════════════════════════════════
   ZOOM PILL — the desktop viewport control (Miro web's bottom-right
   pill): frame the map · zoom out · live percentage · zoom in. Phones
   keep the round FrameMapButton instead (thumb-sized, tour-anchored).
   ════════════════════════════════════════════════════════════════════ */

import { useReactFlow, useStore } from "@xyflow/react";
import { cardStyle } from "@/lib/ui";
import { useIsPhone, useReducedMotion } from "@/hooks/use-media";

export function ZoomPill({ onFit }: { onFit: () => void }) {
  const rf = useReactFlow();
  const isPhone = useIsPhone();
  const reducedMotion = useReducedMotion();
  // Subscribes to the store so the readout is live, but only re-renders
  // when the ROUNDED percentage changes — not every sub-pixel zoom frame.
  const pct = useStore((s) => Math.round(s.transform[2] * 100));
  const duration = reducedMotion ? 0 : 150;
  const btn =
    "flex h-8 w-8 items-center justify-center rounded-md hover:bg-black/5 active:bg-black/10";
  return (
    // Desktop only — CSS-hidden below `sm` AND JS-hidden whenever
    // useIsPhone says phone (landscape phones are ≥640px wide; same
    // pattern as the top Toolbar).
    <div
      data-ui-chrome
      className={`absolute bottom-3 right-[max(0.75rem,env(safe-area-inset-right))] z-20 hidden select-none items-center gap-0.5 rounded-xl p-1 ${
        isPhone ? "" : "sm:flex"
      }`}
      style={{ ...cardStyle, touchAction: "manipulation" }}
    >
      <button
        data-tour="frame"
        aria-label="Frame the map"
        title="Frame the map"
        className={btn}
        style={{ color: "var(--ink-soft)" }}
        onClick={onFit}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M5.5 1.5H3A1.5 1.5 0 0 0 1.5 3v2.5" />
          <path d="M10.5 1.5H13A1.5 1.5 0 0 1 14.5 3v2.5" />
          <path d="M5.5 14.5H3A1.5 1.5 0 0 1 1.5 13v-2.5" />
          <path d="M10.5 14.5H13a1.5 1.5 0 0 0 1.5-1.5v-2.5" />
        </svg>
      </button>
      <button
        aria-label="Zoom out"
        title="Zoom out"
        className={btn}
        style={{ color: "var(--ink-soft)" }}
        onClick={() => rf.zoomOut({ duration })}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 12 12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M2 6h8" />
        </svg>
      </button>
      <button
        aria-label={`Zoom level ${pct}% — reset to 100%`}
        title="Reset zoom to 100%"
        className="h-8 min-w-12 rounded-md px-1 text-center text-xs tabular-nums hover:bg-black/5 active:bg-black/10"
        style={{ color: "var(--ink-soft)" }}
        onClick={() => rf.zoomTo(1, { duration })}
      >
        {pct}%
      </button>
      <button
        aria-label="Zoom in"
        title="Zoom in"
        className={btn}
        style={{ color: "var(--ink-soft)" }}
        onClick={() => rf.zoomIn({ duration })}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 12 12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M2 6h8M6 2v8" />
        </svg>
      </button>
    </div>
  );
}
