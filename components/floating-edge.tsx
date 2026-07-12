"use client";

/* ════════════════════════════════════════════════════════════════════
   FLOATING EDGE — arrows between cards, with label pill + popover
   (desktop), the phone arrow-edit bottom sheet, and the in-progress
   connection line
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
import { pointOnRectSide, nearestCardinalSide } from "@/lib/geometry";
import { ARROW_INK } from "@/lib/tuning";
import { cardStyle, panelStyle } from "@/lib/ui";
import { useAppApi } from "@/hooks/use-app-api";
import { useIsCoarse, useIsPhone } from "@/hooks/use-media";
import type { Arrow, HandleSide } from "@/lib/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { useCommitOnDismiss } from "@/components/part-editor";

/** Keep the selected-arrow popover clear of the toolbar/notice-pill chrome
 *  at the top and bottom of the screen — unlike the part editors, this
 *  popover is positioned purely from the edge's flow-space midpoint, so
 *  nothing previously stopped it landing under that chrome near the
 *  screen edges. */
const VIEWPORT_MARGIN = { top: 64, bottom: 84, side: 12 };

export type FloatingEdgeType = Edge<
  {
    label?: string;
    sourceHandle?: HandleSide;
    /** Exactly this arrow is selected (and no nodes) — a marquee auto-
     *  selects every edge between caught cards, and those must not each
     *  open a popover. */
    solo?: boolean;
  },
  "floating"
>;

/** Small text input for an arrow's relationship label ("manages",
 *  "protects", …). Local draft state, committed on blur / Enter. The
 *  `sheet` variant is full-width and thumb-sized for the phone sheet. */
function ArrowLabelInput({
  id,
  label,
  sheet,
}: {
  id: string;
  label?: string;
  sheet?: boolean;
}) {
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
  // Every dismissal unmounts this field (deselect nulls the arrow prop),
  // so the unmount flush covers swipe/scrim/Done/pane-tap — paths where
  // iOS never fires the blur this field otherwise commits on.
  useCommitOnDismiss(`arrow-label:${id}`, commit);
  return (
    <input
      className={
        sheet
          ? "nodrag nopan w-full rounded-lg px-3 py-2 text-sm outline-none"
          : "nodrag nopan w-36 rounded-md px-2 py-1 text-xs outline-none"
      }
      style={{
        background: sheet ? "rgba(255,255,255,0.7)" : "#fff",
        border: "1px solid var(--line)",
        color: "var(--ink-soft)",
      }}
      placeholder="label — e.g. manages"
      maxLength={40}
      enterKeyHint="done"
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
    // Clamp against the *visible* viewport. On iOS Safari window.innerHeight
    // spans the area behind the collapsing toolbar, so a popover clamped to it
    // can sit under Safari's bars / off-screen; visualViewport is the actually
    // visible box (falls back to window where it's unsupported). Offset is
    // intentionally not applied — with body overflow hidden and no page
    // pinch-zoom, getBoundingClientRect already shares this box's origin.
    const vv = window.visualViewport;
    const winW = vv?.width ?? window.innerWidth;
    const winH = vv?.height ?? window.innerHeight;
    const left = r.left - clamp.dx;
    const right = r.right - clamp.dx;
    const top0 = r.top - clamp.dy;
    const bottom0 = r.bottom - clamp.dy;
    const { top, bottom, side } = VIEWPORT_MARGIN;
    let dx = 0;
    let dy = 0;
    if (left < side) dx = side - left;
    else if (right > winW - side) dx = winW - side - right;
    if (top0 < top) dy = top - top0;
    else if (bottom0 > winH - bottom) {
      dy = winH - bottom - bottom0;
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
  // Both ends attach to a cardinal MIDPOINT (top/bottom/left/right) of the
  // card — never an arbitrary point along the edge. The source uses
  // whichever connect dot it was dragged from (data.sourceHandle) when
  // known, else the side facing the target; the target uses the side facing
  // the source. A small breathing gap (SOURCE_GAP/ARROW_GAP) keeps the
  // head/tail off the card face (the node layer paints above the edge SVG),
  // in flow-space so it scales with zoom.
  const sourceSide: HandleSide = data?.sourceHandle ?? nearestCardinalSide(sc, tc);
  const sp = pointOnRectSide(
    sc,
    sd.w + SOURCE_GAP * 2,
    sd.h + SOURCE_GAP * 2,
    sourceSide,
  );
  const sourcePosition = HANDLE_TO_POSITION[sourceSide];

  const targetSide = nearestCardinalSide(tc, sp);
  const tp = pointOnRectSide(
    tc,
    td.w + ARROW_GAP * 2,
    td.h + ARROW_GAP * 2,
    targetSide,
  );
  const targetPosition = HANDLE_TO_POSITION[targetSide];

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
      {/* The floating popover is desktop-only — on phones a selected arrow
          opens the ArrowEditSheet below (keyboard-aware, thumb-sized), and
          only the label pill renders here. */}
      {((selected && data?.solo && !isPhone) || data?.label) && (
        <EdgeLabelRenderer>
          <div
            className="nopan absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX + clamp.dx}px, ${labelY + clamp.dy}px)`,
              pointerEvents: "all",
            }}
          >
            {selected && data?.solo && !isPhone ? (
              <div
                ref={popoverRef}
                className="fade-in nowheel flex max-w-[min(20rem,88vw)] flex-wrap items-center justify-center gap-x-1.5 gap-y-2 rounded-xl px-3 py-2"
                style={cardStyle}
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
                  </>
                )}
              </div>
            ) : (
              <button
                className="block max-w-40 truncate rounded-full px-2.5 py-1 text-[11px]"
                style={{
                  ...(isPhone ? panelStyle : cardStyle),
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

/** Phone arrow editor — a keyboard-aware bottom sheet (the same shell as
 *  part editing) replacing the floating popover, which was a desktop
 *  pattern: tiny label input, and the iOS keyboard could cover it.
 *  Mounted once at app level, driven by the selected edge. */
export function ArrowEditSheet({
  arrow,
  open,
  onClose,
}: {
  arrow: Arrow | null;
  open: boolean;
  onClose: () => void;
}) {
  const api = useAppApi();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // A close or a different arrow drops any pending "delete?" (render-time
  // derived-state reset, the file's idiom).
  const editKey = `${open}:${arrow?.id ?? ""}`;
  const [wasKey, setWasKey] = useState(editKey);
  if (wasKey !== editKey) {
    setWasKey(editKey);
    setConfirmDelete(false);
  }
  const rowCls =
    "flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 py-3 text-left text-sm transition-colors hover:bg-black/5 active:bg-black/10";
  return (
    <BottomSheet open={open} onClose={onClose} label="Arrow">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="flex shrink-0 items-center justify-between pb-2">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--ink-soft)" }}
          >
            Arrow
          </span>
          <button
            aria-label="Done editing arrow"
            className="shrink-0 rounded-full px-3 py-2 text-xs transition-opacity active:opacity-70 pointer-coarse:min-h-10"
            style={{ background: "rgba(0,0,0,0.05)", color: "var(--ink-soft)" }}
            onClick={onClose}
          >
            Done
          </button>
        </div>
        {arrow && (
          <>
            <ArrowLabelInput
              key={arrow.id}
              id={arrow.id}
              label={arrow.label}
              sheet
            />
            <div className="pt-2.5">
              <button
                className={rowCls}
                style={{ color: "var(--ink-soft)" }}
                onClick={() => api.reverseArrow(arrow.id)}
              >
                ⇄ Reverse direction
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                  <span
                    className="min-w-0 flex-1 text-[12px]"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    Delete this arrow?
                  </span>
                  <button
                    className="min-h-10 rounded-lg px-3.5 py-2 text-xs transition-opacity active:opacity-75"
                    style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
                    onClick={() => api.deleteArrow(arrow.id)}
                  >
                    delete
                  </button>
                  <button
                    className="min-h-10 rounded-lg px-3.5 py-2 text-xs active:bg-black/10"
                    style={{ color: "var(--ink-soft)" }}
                    onClick={() => setConfirmDelete(false)}
                  >
                    cancel
                  </button>
                </div>
              ) : (
                <button
                  className={rowCls}
                  style={{ color: "var(--danger)" }}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete arrow
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

export function ConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
}: ConnectionLineComponentProps) {
  const horizontal = Math.abs(toX - fromX) > Math.abs(toY - fromY);
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    // Exit from the grabbed dot's side, so the preview matches the committed
    // arrow (which pins `data.sourceHandle`); fall back to the aim direction.
    sourcePosition:
      fromPosition ??
      (horizontal
        ? toX > fromX
          ? Position.Right
          : Position.Left
        : toY > fromY
          ? Position.Bottom
          : Position.Top),
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
            fill={ARROW_INK}
            stroke={ARROW_INK}
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>
      <path
        d={path}
        fill="none"
        stroke={ARROW_INK}
        strokeWidth={2}
        strokeLinecap="round"
        markerEnd="url(#parts-connect-arrow)"
      />
    </>
  );
}
