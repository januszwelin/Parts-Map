"use client";

/* ════════════════════════════════════════════════════════════════════
   PART NODE — the card on the canvas
   ════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
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
  { part: Part; lifted: boolean; popKey: number; revealKey: number },
  "part"
>;

export function PartNode({
  id,
  data,
  selected,
  dragging,
}: NodeProps<PartNodeType>) {
  const { part, lifted, popKey, revealKey } = data;
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

  return (
    <div
      className={`relative h-full w-full select-none ${dragging ? "z-10" : ""}`}
      style={{
        minWidth: part.w ? undefined : 92,
        maxWidth: part.w ? undefined : 200,
      }}
    >
      <NodeResizer
        isVisible={!!selected && !dragging}
        minWidth={90}
        minHeight={44}
        keepAspectRatio={part.shape === "ellipse"}
        onResizeEnd={() => api.endResize(id)}
      />

      <div
        ref={(el) => {
          api.registerPartInner(part.id, el);
        }}
        className={`part-inner flex h-full w-full items-center justify-center px-4 py-3 text-center leading-snug ${
          lifted ? "lifted" : ""
        } ${popping ? "drop-pop" : ""} ${revealing ? "reveal-glow" : ""}`}
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
          border: "1px solid rgba(58,55,51,0.08)",
        }}
      >
        <span className="pointer-events-none break-words">{part.name}</span>
        {part.note && (
          <span
            className="pointer-events-none absolute bottom-1.5 right-2 h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--ink-faint)", opacity: 0.7 }}
            aria-hidden
          />
        )}
        {onBackSurface && (
          <span
            className="pointer-events-none absolute -top-2 right-2 rounded-full px-1.5 text-[9px] tracking-wide"
            style={{
              background: "var(--ink-soft)",
              color: "#fff",
              lineHeight: "14px",
            }}
          >
            {partSurface(part)}
          </span>
        )}
      </div>

      {/* Arrow sources: rim dots, revealed on hover / selection.
          Visuals + 28px touch hit area live in globals.css. */}
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
        isVisible={!!selected && !dragging && !connectionInProgress && !isPhone}
        position={Position.Top}
        offset={14}
      >
        <EditPopover part={part} />
      </NodeToolbar>
    </div>
  );
}
