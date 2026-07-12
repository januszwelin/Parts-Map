"use client";

/* ════════════════════════════════════════════════════════════════════
   PART NODE — the card on the canvas
   ════════════════════════════════════════════════════════════════════ */

import { memo, useRef, useState } from "react";
import {
  NodeToolbar,
  NodeResizer,
  Handle,
  Position,
  useConnection,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { Part } from "@/lib/types";
import { partSurface, FONT_PX, SHAPE_RADIUS } from "@/lib/part-utils";
import { useAppApi } from "@/hooks/use-app-api";
import { useIsPhone } from "@/hooks/use-media";
import { EditPopover } from "@/components/part-editor";

export type PartNodeType = Node<
  {
    part: Part;
    lifted: boolean;
    popKey: number;
    revealKey: number;
    /** On-body but on the hidden surface — resting in a side lane. */
    parked: boolean;
    /** At most one node is selected — the desktop marquee can select
     *  several, and the edit popover must not open once per card. */
    solo: boolean;
    /** The whole multi-selection drags together (every member off-body)
     *  — the refusal probe must stay quiet for these. */
    groupDrag: boolean;
  },
  "part"
>;

/** Memoized with a custom comparator: `nodes` in parts-map-app.tsx rebuilds
 *  a fresh `data` object for every part on every render (any single-field
 *  edit, or a drag-follow-camera frame during someone else's drag), so the
 *  default shallow-prop compare would never bail — `data`'s wrapper object
 *  is always a new reference even when its contents didn't change. This
 *  compares the contents instead: `data.part` keeps its reference for any
 *  part `setParts` didn't touch (every mutation in this app is a `.map()`
 *  that only spreads the matching id), so an unrelated card's edit no
 *  longer forces every other card to reconcile on a crowded map. */
export const PartNode = memo(function PartNode({
  id,
  data,
  selected,
  dragging,
}: NodeProps<PartNodeType>) {
  const { part, lifted, popKey, revealKey, parked, solo, groupDrag } = data;
  const api = useAppApi();
  const onBackSurface = !part.offBody && partSurface(part) === "back";
  const connectionInProgress = useConnection((c) => c.inProgress);
  // Phone layout edits through the bottom sheet (app level), not a
  // floating popover crammed over the figures.
  const isPhone = useIsPhone();
  // One-shot landing pop: the drop bumps popKey; the class rides the CSS
  // keyframe and is retired on animationend so a later re-render can't
  // replay it.
  const [popPlayed, setPopPlayed] = useState(0);
  const popping = popKey !== 0 && popKey !== popPlayed;
  // One-shot reveal halo (the list's "where is it?"), same retirement.
  const [revealPlayed, setRevealPlayed] = useState(0);
  const revealing = revealKey !== 0 && revealKey !== revealPlayed;
  // Locked/parked/multi-selected cards aren't draggable, and React Flow
  // emits nothing for a drag attempt on a non-draggable node — a silent
  // dead gesture. A tiny pointer probe answers the tug (once per gesture)
  // with a refusal tick + a one-line why via api.noticeBlockedDrag.
  // Tap-select still works: nothing here stops propagation.
  const inMulti = !!selected && !solo;
  const refuse = parked || !!part.locked || (inMulti && !groupDrag);
  const tugRef = useRef<{ x: number; y: number; fired: boolean } | null>(null);
  const refuseProbe = refuse
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          tugRef.current = { x: e.clientX, y: e.clientY, fired: false };
        },
        onPointerMove: (e: React.PointerEvent) => {
          const t = tugRef.current;
          if (!t || t.fired) return;
          if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) {
            t.fired = true;
            api.noticeBlockedDrag(part.id, inMulti ? "multi" : undefined);
          }
        },
        onPointerUp: () => {
          tugRef.current = null;
        },
        onPointerCancel: () => {
          tugRef.current = null;
        },
      }
    : {};

  return (
    <div
      className={`relative h-full w-full select-none ${dragging ? "z-10" : ""}`}
      style={{
        minWidth: part.w ? undefined : 92,
        maxWidth: part.w ? undefined : 200,
      }}
    >
      <NodeResizer
        isVisible={!!selected && !dragging && !part.locked}
        minWidth={90}
        minHeight={44}
        keepAspectRatio={part.shape === "ellipse"}
        onResizeEnd={() => api.endResize(id)}
      />

      <div
        ref={(el) => {
          api.registerPartInner(part.id, el);
        }}
        {...refuseProbe}
        className={`part-inner flex h-full w-full items-center justify-center px-4 py-3 text-center leading-snug ${
          lifted ? "lifted" : ""
        } ${popping ? "drop-pop" : ""} ${revealing ? "reveal-glow" : ""} ${
          parked ? "parked" : ""
        }`}
        onAnimationEnd={(e) => {
          if (e.animationName === "drop-pop") setPopPlayed(popKey);
          if (e.animationName === "reveal-glow") setRevealPlayed(revealKey);
        }}
        style={{
          background: part.color,
          color: "var(--ink)",
          borderRadius: SHAPE_RADIUS[part.shape],
          fontSize: FONT_PX[part.fontSize],
          fontWeight: part.bold ? 600 : 400,
          textDecoration: part.underline ? "underline" : undefined,
          border: "1px solid rgba(58,55,51,0.08)",
        }}
      >
        <span className="pointer-events-none break-words">{part.name}</span>
        {part.note && (
          <span
            className="pointer-events-none absolute bottom-1.5 right-2 h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--ink-faint)", opacity: 0.7 }}
            role="img"
            aria-label="has a note"
          />
        )}
        {onBackSurface && (
          <span
            className="pointer-events-none absolute -top-2 right-2 rounded-full px-1.5 text-[10px] tracking-wide"
            style={{
              background: "var(--ink-soft)",
              color: "#fff",
              lineHeight: "14px",
            }}
          >
            {partSurface(part)}
          </span>
        )}
        {part.locked && (
          <span
            className="pointer-events-none absolute -top-2 left-2 flex h-4 w-4 items-center justify-center rounded-full"
            style={{ background: "var(--ink-soft)", color: "#fff" }}
            aria-hidden
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </span>
        )}
      </div>

      {/* Arrow sources: rim dots, revealed on hover / selection.
          Visuals + touch hit area (fattened on coarse) live in globals.css. */}
      <Handle type="source" position={Position.Top} id="st" className="part-source-handle" />
      <Handle type="source" position={Position.Right} id="sr" className="part-source-handle" />
      <Handle type="source" position={Position.Bottom} id="sb" className="part-source-handle" />
      <Handle type="source" position={Position.Left} id="sl" className="part-source-handle" />

      {/* Full-card drop target, active only while an arrow is being drawn,
          so touching a card normally never hits a handle. */}
      <Handle
        type="target"
        position={Position.Left}
        id="body"
        isConnectableStart={false}
        style={{
          position: "absolute",
          inset: 0,
          transform: "none",
          width: "100%",
          height: "100%",
          borderRadius: SHAPE_RADIUS[part.shape],
          opacity: 0,
          border: "none",
          background: "transparent",
          pointerEvents: connectionInProgress ? "all" : "none",
        }}
      />

      <NodeToolbar
        isVisible={
          !!selected && solo && !dragging && !connectionInProgress && !isPhone
        }
        position={Position.Top}
        offset={14}
      >
        <EditPopover part={part} />
      </NodeToolbar>
    </div>
  );
},
(prev, next) =>
  prev.id === next.id &&
  prev.selected === next.selected &&
  prev.dragging === next.dragging &&
  prev.data.part === next.data.part &&
  prev.data.lifted === next.data.lifted &&
  prev.data.popKey === next.data.popKey &&
  prev.data.revealKey === next.data.revealKey &&
  prev.data.parked === next.data.parked &&
  // Only selected cards render anything solo/groupDrag-dependent (the
  // toolbar, the refusal probe), so unselected cards can skip
  // reconciling on every selection change.
  ((prev.data.solo === next.data.solo &&
    prev.data.groupDrag === next.data.groupDrag) ||
    !next.selected),
);
