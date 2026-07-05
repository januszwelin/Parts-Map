"use client";

/* ════════════════════════════════════════════════════════════════════
   FLOATING EDGE — arrows between cards, with label pill + popover, and
   the in-progress connection line
   ════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import {
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
  type ConnectionLineComponentProps,
} from "@xyflow/react";
import { ARROW_COLORS } from "@/lib/tuning";
import { rectEdgePoint } from "@/lib/geometry";
import { panelStyle } from "@/lib/ui";
import { useAppApi } from "@/hooks/use-app-api";

export type FloatingEdgeType = Edge<
  { color: string; label?: string },
  "floating"
>;

/** Small text input for an arrow's relationship label ("manages",
 *  "protects", …). Local draft state, committed on blur / Enter. */
function ArrowLabelInput({ id, label }: { id: string; label?: string }) {
  const api = useAppApi();
  const [text, setText] = useState(label ?? "");
  // Re-seed the draft when the authoritative label changes underneath us
  // (same render-time derived-state reset as LocationField).
  const [lastLabel, setLastLabel] = useState(label ?? "");
  if (lastLabel !== (label ?? "")) {
    setLastLabel(label ?? "");
    setText(label ?? "");
  }
  const commit = () => {
    const t = text.trim().slice(0, 40);
    if (t === (label ?? "")) return;
    api.updateArrow(id, { label: t || undefined });
  };
  return (
    <input
      className="nodrag nopan w-36 rounded-md px-2 py-1 text-xs outline-none"
      style={{
        background: "rgba(255,255,255,0.7)",
        border: "1px solid var(--line)",
        color: "var(--ink-soft)",
      }}
      placeholder="label — e.g. manages"
      maxLength={40}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

/** Air between an arrow's endpoints and the card faces it connects: the
 *  head ends short of the target so it never tucks under the card, and the
 *  tail leaves a hint of light at the source for symmetry. */
const ARROW_GAP = 6;
const SOURCE_GAP = 2.5;

export function FloatingEdge({
  id,
  source,
  target,
  selected,
  style,
  markerEnd,
  data,
}: EdgeProps<FloatingEdgeType>) {
  const api = useAppApi();
  const sn = useInternalNode(source);
  const tn = useInternalNode(target);
  if (!sn || !tn) return null;

  const dims = (n: typeof sn) => ({
    w: n.measured?.width ?? n.width ?? 140,
    h: n.measured?.height ?? n.height ?? 48,
  });
  const sd = dims(sn);
  const td = dims(tn);
  const sc = {
    x: sn.internals.positionAbsolute.x + sd.w / 2,
    y: sn.internals.positionAbsolute.y + sd.h / 2,
  };
  const tc = {
    x: tn.internals.positionAbsolute.x + td.w / 2,
    y: tn.internals.positionAbsolute.y + td.h / 2,
  };
  // Terminate on a slightly expanded rect: the node layer paints above the
  // edge SVG, so a path ending exactly on the border loses the arrowhead
  // tip under the card. A small breathing gap keeps the full head visible
  // at any approach angle (flow-space, so it scales with zoom).
  const sp = rectEdgePoint(sc, sd.w + SOURCE_GAP * 2, sd.h + SOURCE_GAP * 2, tc);
  const tp = rectEdgePoint(tc, td.w + ARROW_GAP * 2, td.h + ARROW_GAP * 2, sc);

  const horizontal = Math.abs(tc.x - sc.x) > Math.abs(tc.y - sc.y);
  const sourcePosition = horizontal
    ? tc.x > sc.x
      ? Position.Right
      : Position.Left
    : tc.y > sc.y
      ? Position.Bottom
      : Position.Top;
  const targetPosition = horizontal
    ? tc.x > sc.x
      ? Position.Left
      : Position.Right
    : tc.y > sc.y
      ? Position.Top
      : Position.Bottom;

  const [path, labelX, labelY] = getBezierPath({
    sourceX: sp.x,
    sourceY: sp.y,
    sourcePosition,
    targetX: tp.x,
    targetY: tp.y,
    targetPosition,
    curvature: 0.28,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={24}
      />
      {(selected || data?.label) && (
        <EdgeLabelRenderer>
          <div
            className="nopan absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            {selected ? (
              <div
                className="fade-in flex max-w-[min(20rem,88vw)] flex-wrap items-center justify-center gap-x-1.5 gap-y-2 rounded-2xl px-3 py-2"
                style={panelStyle}
              >
                <ArrowLabelInput key={id} id={id} label={data?.label} />
                <button
                  aria-label="Delete arrow"
                  onClick={() => api.deleteArrow(id)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-xs hover:bg-black/5"
                  style={{ color: "var(--ink-soft)" }}
                >
                  ✕
                </button>
                <div className="flex w-full items-center justify-center gap-0.5">
                  {ARROW_COLORS.map((c) => (
                    <button
                      key={c}
                      aria-label={`Arrow color ${c}`}
                      onClick={() => api.updateArrow(id, { color: c })}
                      className="flex h-7 w-7 items-center justify-center rounded-full"
                    >
                      <span
                        className="h-4 w-4 rounded-full"
                        style={{
                          background: c,
                          outline:
                            data?.color === c
                              ? "2px solid var(--ink)"
                              : "none",
                          outlineOffset: 1,
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button
                className="block max-w-40 truncate rounded-full px-2.5 py-1 text-[11px]"
                style={{
                  ...panelStyle,
                  color: "var(--ink-soft)",
                  cursor: "pointer",
                }}
                onClick={() => api.selectArrow(id)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {data?.label}
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export function ConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
}: ConnectionLineComponentProps) {
  const horizontal = Math.abs(toX - fromX) > Math.abs(toY - fromY);
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: horizontal
      ? toX > fromX
        ? Position.Right
        : Position.Left
      : toY > fromY
        ? Position.Bottom
        : Position.Top,
    targetX: toX,
    targetY: toY,
    targetPosition: horizontal
      ? toX > fromX
        ? Position.Left
        : Position.Right
      : toY > fromY
        ? Position.Top
        : Position.Bottom,
    curvature: 0.28,
  });
  return (
    <>
      {/* Same head geometry as React Flow's ArrowClosed marker, so the
          in-progress line speaks the committed arrow's language. */}
      <defs>
        <marker
          id="parts-connect-arrow"
          viewBox="-10 -10 20 20"
          markerWidth={16}
          markerHeight={16}
          markerUnits="strokeWidth"
          orient="auto"
          refX={0}
          refY={0}
        >
          <polyline
            points="-5,-4 0,0 -5,4 -5,-4"
            fill="var(--accent)"
            stroke="var(--accent)"
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>
      <path
        d={path}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinecap="round"
        markerEnd="url(#parts-connect-arrow)"
      />
    </>
  );
}
