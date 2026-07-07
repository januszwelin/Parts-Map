"use client";

/* ════════════════════════════════════════════════════════════════════
   FLOATING EDGE — arrows between cards, with label pill + popover, and
   the in-progress connection line
   ════════════════════════════════════════════════════════════════════ */

import { useLayoutEffect, useRef, useState } from "react";
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
import { ARROW_COLORS, ARROW_COLOR_NAMES } from "@/lib/tuning";
import { rectEdgePoint, pointOnRectSide } from "@/lib/geometry";
import { panelStyle } from "@/lib/ui";
import { useAppApi } from "@/hooks/use-app-api";
import { useIsCoarse, useIsPhone } from "@/hooks/use-media";
import type { HandleSide } from "@/lib/types";

/** Keep the selected-arrow popover clear of the toolbar/notice-pill chrome
 *  at the top and bottom of the screen — unlike the part editors, this
 *  popover is positioned purely from the edge's flow-space midpoint, so
 *  nothing previously stopped it landing under that chrome near the
 *  screen edges. */
const VIEWPORT_MARGIN = { top: 64, bottom: 84, side: 12 };

export type FloatingEdgeType = Edge<
  { color: string; label?: string; sourceHandle?: HandleSide },
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

/** Maps a connect-dot id (part-node.tsx's source Handles) to the RF
 *  `Position` it sits at, for the fixed-exit-side path below. */
const HANDLE_TO_POSITION: Record<HandleSide, Position> = {
  st: Position.Top,
  sr: Position.Right,
  sb: Position.Bottom,
  sl: Position.Left,
};

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
  const coarse = useIsCoarse();
  const isPhone = useIsPhone();
  const sn = useInternalNode(source);
  const tn = useInternalNode(target);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Render-time derived-state reset (the codebase idiom, see LocationField
  // in part-editor.tsx) rather than an effect: deselecting the arrow
  // shouldn't leave a stale "delete this arrow?" waiting for next time.
  const [wasSelected, setWasSelected] = useState(selected);
  if (selected !== wasSelected) {
    setWasSelected(selected);
    if (!selected) setConfirmDelete(false);
  }

  // Nudge the popover back on-screen (and clear of the toolbar/notice-pill
  // chrome) when its natural flow-space position would land it off the
  // edge — the label pill itself stays put; only the expanded popover
  // needs this, since it's the one that can overflow.
  const popoverRef = useRef<HTMLDivElement>(null);
  const [clamp, setClamp] = useState({ dx: 0, dy: 0 });
  // Deliberately no dependency array: the popover's rect can shift for
  // reasons that aren't a clean dependency list (confirm-mode toggling its
  // size, the arrow's midpoint moving, a phone-size change) — this needs
  // to re-measure after every render, not a specific set of props. The
  // dx/dy-unchanged bail-outs below are what keep it from looping.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!selected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClamp((prev) => (prev.dx === 0 && prev.dy === 0 ? prev : { dx: 0, dy: 0 }));
      return;
    }
    const el = popoverRef.current;
    if (!el) return;
    // The measured rect already includes whatever clamp is currently
    // applied — subtract it back out so we're always reasoning about the
    // popover's true (unclamped) flow-space position, or this would
    // oscillate (correct, re-measure the corrected position as "fine",
    // un-correct, repeat).
    const r = el.getBoundingClientRect();
    const left = r.left - clamp.dx;
    const right = r.right - clamp.dx;
    const top0 = r.top - clamp.dy;
    const bottom0 = r.bottom - clamp.dy;
    const { top, bottom, side } = VIEWPORT_MARGIN;
    let dx = 0;
    let dy = 0;
    if (left < side) dx = side - left;
    else if (right > window.innerWidth - side) dx = window.innerWidth - side - right;
    if (top0 < top) dy = top - top0;
    else if (bottom0 > window.innerHeight - bottom) {
      dy = window.innerHeight - bottom - bottom0;
    }
    setClamp((prev) => (prev.dx === dx && prev.dy === dy ? prev : { dx, dy }));
  });

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
  //
  // The source side is fixed to whichever connect dot the arrow was
  // actually dragged from, when known — otherwise (legacy arrows saved
  // before this field existed) it falls back to the old geometry-only
  // calculation. The target side always stays geometry-only: connections
  // drop anywhere on the target card (one full-card Handle, deliberately,
  // for forgiving touch drops), so there's no equivalent fixed side to use.
  let sp: { x: number; y: number };
  let sourcePosition: Position;
  if (data?.sourceHandle) {
    sourcePosition = HANDLE_TO_POSITION[data.sourceHandle];
    sp = pointOnRectSide(
      sc,
      sd.w + SOURCE_GAP * 2,
      sd.h + SOURCE_GAP * 2,
      data.sourceHandle,
    );
  } else {
    sp = rectEdgePoint(sc, sd.w + SOURCE_GAP * 2, sd.h + SOURCE_GAP * 2, tc);
    const horizontal = Math.abs(tc.x - sc.x) > Math.abs(tc.y - sc.y);
    sourcePosition = horizontal
      ? tc.x > sc.x
        ? Position.Right
        : Position.Left
      : tc.y > sc.y
        ? Position.Bottom
        : Position.Top;
  }

  const tp = rectEdgePoint(tc, td.w + ARROW_GAP * 2, td.h + ARROW_GAP * 2, sp);
  const horizontalToTarget = Math.abs(tc.x - sp.x) > Math.abs(tc.y - sp.y);
  const targetPosition = horizontalToTarget
    ? tc.x > sp.x
      ? Position.Left
      : Position.Right
    : tc.y > sp.y
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
        interactionWidth={coarse ? 44 : 24}
      />
      {(selected || data?.label) && (
        <EdgeLabelRenderer>
          <div
            className="nopan absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX + clamp.dx}px, ${labelY + clamp.dy}px)`,
              pointerEvents: "all",
            }}
          >
            {selected ? (
              <div
                ref={popoverRef}
                className="fade-in flex max-w-[min(20rem,88vw)] flex-wrap items-center justify-center gap-x-1.5 gap-y-2 rounded-2xl px-3 py-2"
                style={panelStyle}
              >
                {confirmDelete ? (
                  <>
                    <span
                      className="px-1 text-[12px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      Delete this arrow?
                    </span>
                    <button
                      aria-label="Confirm delete arrow"
                      onClick={() => api.deleteArrow(id)}
                      className={`${isPhone ? "min-h-10 px-3.5" : "min-h-8 px-2.5"} rounded-md py-1 text-xs`}
                      style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
                    >
                      delete
                    </button>
                    <button
                      aria-label="Cancel delete"
                      onClick={() => setConfirmDelete(false)}
                      className={`${isPhone ? "min-h-10 px-3.5" : "min-h-8 px-2.5"} rounded-md py-1 text-xs`}
                      style={{ color: "var(--ink-soft)" }}
                    >
                      cancel
                    </button>
                  </>
                ) : (
                  <>
                    <ArrowLabelInput key={id} id={id} label={data?.label} />
                    <button
                      aria-label="Reverse arrow direction"
                      onClick={() => api.reverseArrow(id)}
                      className={`${isPhone ? "min-h-10 px-3" : "min-h-8 px-2.5"} rounded-md py-1 text-xs hover:bg-black/5`}
                      style={{ color: "var(--ink-soft)" }}
                    >
                      ⇄ reverse
                    </button>
                    <button
                      aria-label="Delete arrow"
                      onClick={() => setConfirmDelete(true)}
                      className={`${isPhone ? "min-h-10 px-3.5" : "min-h-8 px-2.5"} rounded-md py-1 text-xs`}
                      style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
                    >
                      delete
                    </button>
                    <div className="flex w-full flex-wrap items-center justify-center gap-0.5">
                      {ARROW_COLORS.map((c) => (
                        <button
                          key={c}
                          aria-label={`Arrow color ${ARROW_COLOR_NAMES[c] ?? c}`}
                          aria-pressed={data?.color === c}
                          onClick={() => api.updateArrow(id, { color: c })}
                          className={
                            isPhone
                              ? "flex h-9 w-9 items-center justify-center rounded-full"
                              : "flex h-7 w-7 items-center justify-center rounded-full"
                          }
                        >
                          <span
                            className={isPhone ? "h-5 w-5 rounded-full" : "h-4 w-4 rounded-full"}
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
                  </>
                )}
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
