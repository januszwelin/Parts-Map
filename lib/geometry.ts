/* ════════════════════════════════════════════════════════════════════
   GEOMETRY & EASING
   ════════════════════════════════════════════════════════════════════ */

import type { CoordinateExtent, XYPosition } from "@xyflow/react";
import {
  BODY_H,
  BODY_W,
  PARK_LANE,
  SINGLE_SCENE_W,
  SNAP_FRAC,
  EXTENT_MARGIN,
} from "@/lib/tuning";
import { REGIONS, REGION_BY_KEY, type RegionDef } from "@/lib/regions";
import type { Depth, HandleSide, Part } from "@/lib/types";
import { partSurface } from "@/lib/part-utils";

/** Region anchor → flow-space center on the single centered body for the
 *  given surface. The body sits at flow x = 0 (there is one figure now,
 *  chosen by the active `view`); the back surface is seen from behind, so
 *  its x is mirrored — the person's right appears on the viewer's right. */
export function anchorToFlow(
  region: RegionDef,
  depth: Depth,
  bodyScale: number,
): XYPosition {
  const mirror = depth === "back" ? -1 : 1;
  return {
    x: (region.anchor.x - 0.5) * mirror * BODY_W * bodyScale,
    y: (region.anchor.y - 0.5) * BODY_H * bodyScale,
  };
}

/** Where an off-body zone suggests placing a part (converted to freePos
 *  once at placement; the part is free after that). Off zones spread
 *  around the single centered body plus its park lanes. */
export function offBodySuggestion(
  region: RegionDef,
  bodyScale: number,
): XYPosition {
  return {
    x: (region.anchor.x - 0.5) * SINGLE_SCENE_W * bodyScale,
    y: (region.anchor.y - 0.5) * BODY_H * bodyScale,
  };
}

/** Pan bounds for the canvas: the scaled two-figure scene unioned with
 *  every off-body part's freePos, padded by EXTENT_MARGIN (scaled with
 *  the body so the margin stays proportionate). Deliberately depends on
 *  nothing that changes mid-drag (only `parts` and `bodyScale`, both of
 *  which only change on a committed mutation) — the drag/camera rAF
 *  loops never trigger a recompute, they simply get clamped by React
 *  Flow like any other viewport write. */
export function mapExtent(parts: Part[], bodyScale: number): CoordinateExtent {
  let minX = (-SINGLE_SCENE_W * bodyScale) / 2;
  let maxX = (SINGLE_SCENE_W * bodyScale) / 2;
  let minY = (-BODY_H * bodyScale) / 2;
  let maxY = (BODY_H * bodyScale) / 2;
  for (const p of parts) {
    if (!p.offBody) continue;
    const halfW = (p.w ?? 160) / 2 + 40;
    const halfH = (p.h ?? 48) / 2 + 40;
    minX = Math.min(minX, p.freePos.x - halfW);
    maxX = Math.max(maxX, p.freePos.x + halfW);
    minY = Math.min(minY, p.freePos.y - halfH);
    maxY = Math.max(maxY, p.freePos.y + halfH);
  }
  const margin = EXTENT_MARGIN * bodyScale;
  return [
    [minX - margin, minY - margin],
    [maxX + margin, maxY + margin],
  ];
}

/** Magnet-snappable regions per figure.
 *  Front figure: front-surface + silhouette regions.
 *  Back figure: back-surface regions plus the same silhouette regions
 *  (`bothViews` in the config — an elbow is an elbow from either side). */
export const SNAP_SETS: Record<Depth, RegionDef[]> = {
  front: REGIONS.filter((r) => !r.noSnap && !r.offBody && !r.isBack),
  back: REGIONS.filter(
    (r) => !r.noSnap && !r.offBody && (r.isBack || r.bothViews),
  ),
};

/** Nearest magnet-snappable anchor across BOTH figures (or one figure
 *  when `only` is given). The figure a target sits on IS its depth. */
export function nearestTarget(
  p: XYPosition,
  bodyScale: number,
  only?: Depth,
): { region: RegionDef; depth: Depth; dist: number } | null {
  let best: { region: RegionDef; depth: Depth; dist: number } | null = null;
  for (const depth of ["front", "back"] as const) {
    if (only && depth !== only) continue;
    for (const r of SNAP_SETS[depth]) {
      const a = anchorToFlow(r, depth, bodyScale);
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      if (!best || d < best.dist) best = { region: r, depth, dist: d };
    }
  }
  return best;
}

/** The tightest nearest-neighbor anchor gap across both figures (flow
 *  units at scale 1) — in practice the face rows. The drag-follow zoom
 *  derives its working zoom from this: deep enough that even the densest
 *  cluster reads FOLLOW_GAP_PX apart on screen. */
export const MIN_ANCHOR_GAP: number = (() => {
  let min = Infinity;
  for (const depth of ["front", "back"] as const) {
    const snappable = SNAP_SETS[depth];
    for (const r of snappable) {
      for (const s of snappable) {
        if (s === r) continue;
        const d = Math.hypot(
          (r.anchor.x - s.anchor.x) * BODY_W,
          (r.anchor.y - s.anchor.y) * BODY_H,
        );
        if (d < min) min = d;
      }
    }
  }
  return min;
})();

/** Is the point over the single centered body box (inflated by `pad`)?
 *  The pad is deliberately slim: generous enough that the whole traced
 *  silhouette stays magnetic. Keeps the magnet sticky while aiming over
 *  the silhouette and gates the drag-follow zoom. */
export function overBody(
  p: XYPosition,
  bodyScale: number,
  pad = 0.06,
): boolean {
  const hw = (BODY_W * bodyScale * (1 + pad * 2)) / 2;
  const hh = (BODY_H * bodyScale * (1 + pad)) / 2;
  return Math.abs(p.x) <= hw && Math.abs(p.y) <= hh;
}

/** Full magnet resolution for a steer point on the active surface (`view`):
 *  capture radius around each anchor, then a surface fallback (over the
 *  body but outside every capture radius, stay magnetic to the nearest
 *  anchor). The drag loop layers the touch fallback and sticky grip on
 *  top; the drop handler and drag-start seeding use it directly. */
export function resolveMagnet(
  p: XYPosition,
  scale: number,
  view: Depth,
): {
  near: { region: RegionDef; depth: Depth; dist: number } | null;
  hit: boolean;
  snapR: number;
} {
  const snapR = SNAP_FRAC * BODY_H * scale;
  const near = nearestTarget(p, scale, view);
  let hit = !!near && near.dist < snapR;
  if (!hit && near && overBody(p, scale)) hit = true;
  return { near, hit, snapR };
}

/** Where an unmatched import lands: a wrapped grid just below the front
 *  figure, so a batch of "couldn't place this" parts is immediately
 *  visible on screen — the old fallback (the off-right zone's single
 *  suggestion point, staggered a few px per line) put a big batch far to
 *  one side, easy to miss entirely. Deterministic and scale-aware, so it
 *  always lands inside the canvas's pan bounds (mapExtent above). */
const FREE_SPAWN_COLS = 3;
const FREE_SPAWN_DX = 170;
const FREE_SPAWN_DY = 64;
export function freeSpawnGrid(index: number, bodyScale: number): XYPosition {
  const x0 = -(BODY_W * bodyScale) / 2;
  const y0 = (BODY_H * bodyScale) / 2 + 80;
  const col = index % FREE_SPAWN_COLS;
  const row = Math.floor(index / FREE_SPAWN_COLS);
  return { x: x0 + col * FREE_SPAWN_DX, y: y0 + row * FREE_SPAWN_DY };
}

/** Closest off-body zone to a free drop point — gives a free placement a
 *  readable location for the parts list ("Behind me", "Above the head"…). */
export function nearestOffZone(p: XYPosition, bodyScale: number): string {
  let bestKey = "off-front";
  let bestD = Infinity;
  for (const r of REGIONS) {
    // "Free space" is reserved for imports/the picker's own fallback — a
    // manual off-body drop should always read as a direction ("Behind
    // me", "Above the head", …), never the generic catch-all.
    if (!r.offBody || r.freeZone) continue;
    const a = offBodySuggestion(r, bodyScale);
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d < bestD) {
      bestD = d;
      bestKey = r.key;
    }
  }
  return bestKey;
}

/** One parts array → every part's flow-space center. The single source of
 *  truth for "where does this part actually render" — the live canvas, the
 *  drop-settle tween, and the map-image export (lib/exports.ts) all derive
 *  from this so they can never disagree. A part renders on the figure of
 *  the surface it sits on (its depth; back regions are always the back
 *  figure). */
export function derivePositions(
  parts: Part[],
  bodyScale: number,
  view: Depth,
): Map<string, XYPosition> {
  const out = new Map<string, XYPosition>();
  const groupCount = new Map<string, number>();
  // Parked cards (on the hidden surface) rest centered in the side lane.
  const edgeX = (BODY_W / 2 + PARK_LANE / 2) * bodyScale;
  for (const p of parts) {
    const region = REGION_BY_KEY[p.location];
    if (p.offBody || !region || region.offBody) {
      out.set(p.id, p.freePos);
      continue;
    }
    const surface = partSurface(p);
    let pos = anchorToFlow(region, surface, bodyScale);
    // Hidden surface: rest at the nearest side edge, aligned to the part's
    // body height, so a view flip glides it straight back to its point.
    if (surface !== view) {
      pos = { x: (pos.x >= 0 ? 1 : -1) * edgeX, y: pos.y };
    }
    // Co-located parts (same region + depth) fan out in a small
    // deterministic spiral — scaling alone can never separate parts
    // that sit on the same point.
    const gk = `${p.location}:${p.depth}`;
    const n = groupCount.get(gk) ?? 0;
    groupCount.set(gk, n + 1);
    if (n > 0) {
      const angle = n * 2.4;
      const rad = 18 + 7 * n;
      pos = {
        x: pos.x + Math.cos(angle) * rad,
        y: pos.y + Math.sin(angle) * rad,
      };
    }
    out.set(p.id, pos);
  }
  return out;
}

export const easeOutBack = (t: number, s = 1.15) => {
  const c = s + 1;
  return 1 + c * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
};
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Intersection of the line from a rect's center toward `target` with the
 *  rect's boundary — where a floating edge leaves a card. */
export function rectEdgePoint(
  center: XYPosition,
  w: number,
  h: number,
  target: XYPosition,
): XYPosition {
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const sx = w / 2 / Math.abs(dx || 1e-6);
  const sy = h / 2 / Math.abs(dy || 1e-6);
  const s = Math.min(sx, sy);
  return { x: center.x + dx * s, y: center.y + dy * s };
}

/** The point at the center of one named side of a rect — the fixed
 *  counterpart to `rectEdgePoint`'s geometry-only calculation, used when an
 *  arrow's exit side is known (the specific connect dot it was dragged
 *  from) rather than derived from the direction to the other endpoint. */
export function pointOnRectSide(
  center: XYPosition,
  w: number,
  h: number,
  side: HandleSide,
): XYPosition {
  switch (side) {
    case "st":
      return { x: center.x, y: center.y - h / 2 };
    case "sr":
      return { x: center.x + w / 2, y: center.y };
    case "sb":
      return { x: center.x, y: center.y + h / 2 };
    case "sl":
      return { x: center.x - w / 2, y: center.y };
  }
}

/** Which cardinal side of the rect at `from` faces the point `to` — the
 *  dominant axis wins (a mostly-rightward direction picks the right side,
 *  etc.). Feeds `pointOnRectSide` so an arrow always attaches to a
 *  top/bottom/left/right midpoint rather than an arbitrary edge point. */
export function nearestCardinalSide(
  from: XYPosition,
  to: XYPosition,
): HandleSide {
  const horizontal = Math.abs(to.x - from.x) > Math.abs(to.y - from.y);
  return horizontal
    ? to.x > from.x
      ? "sr"
      : "sl"
    : to.y > from.y
      ? "sb"
      : "st";
}
