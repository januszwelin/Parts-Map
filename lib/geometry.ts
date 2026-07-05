/* ════════════════════════════════════════════════════════════════════
   GEOMETRY & EASING
   ════════════════════════════════════════════════════════════════════ */

import type { XYPosition } from "@xyflow/react";
import {
  BODY_H,
  BODY_W,
  VIEW_GAP,
  SCENE_W,
  SNAP_FRAC,
} from "@/lib/tuning";
import { REGIONS, type RegionDef } from "@/lib/regions";
import type { Depth } from "@/lib/types";

/** Center x of a figure in flow space: the front figure sits on the
 *  viewer's left, the back figure on the viewer's right, VIEW_GAP apart. */
export function figureCenterX(depth: Depth, bodyScale: number): number {
  const half = ((BODY_W + VIEW_GAP) * bodyScale) / 2;
  return depth === "back" ? half : -half;
}

/** Region anchor → flow-space center on the figure for that depth.
 *  The back figure is seen from behind, so its x is mirrored — the
 *  person's right appears on the viewer's right there. */
export function anchorToFlow(
  region: RegionDef,
  depth: Depth,
  bodyScale: number,
): XYPosition {
  const mirror = depth === "back" ? -1 : 1;
  return {
    x:
      figureCenterX(depth, bodyScale) +
      (region.anchor.x - 0.5) * mirror * BODY_W * bodyScale,
    y: (region.anchor.y - 0.5) * BODY_H * bodyScale,
  };
}

/** Where an off-body zone suggests placing a part (converted to freePos
 *  once at placement; the part is free after that). Off zones spread
 *  around the whole two-figure scene, not one body. */
export function offBodySuggestion(
  region: RegionDef,
  bodyScale: number,
): XYPosition {
  return {
    x: (region.anchor.x - 0.5) * SCENE_W * bodyScale,
    y: (region.anchor.y - 0.5) * BODY_H * bodyScale,
  };
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

/** Which figure's bounding box (inflated by `pad`) contains the point.
 *  The pad is deliberately slim: generous enough that the whole traced
 *  silhouette stays magnetic, tight enough that the channel between the
 *  two figures is genuinely neutral ground (free placement). */
export function figureUnder(
  p: XYPosition,
  bodyScale: number,
  pad = 0.06,
): Depth | null {
  const hw = (BODY_W * bodyScale * (1 + pad * 2)) / 2;
  const hh = (BODY_H * bodyScale * (1 + pad)) / 2;
  for (const depth of ["front", "back"] as const) {
    if (
      Math.abs(p.x - figureCenterX(depth, bodyScale)) <= hw &&
      Math.abs(p.y) <= hh
    ) {
      return depth;
    }
  }
  return null;
}

/** Full magnet resolution for a steer point: capture radius across both
 *  figures, then the figure-surface fallback (over a figure but outside
 *  every capture radius, stay magnetic to that figure's anchors). The
 *  drag loop layers the touch fallback and sticky grip on top; the drop
 *  handler and drag-start seeding use it directly. */
export function resolveMagnet(
  p: XYPosition,
  scale: number,
): {
  near: { region: RegionDef; depth: Depth; dist: number } | null;
  hit: boolean;
  snapR: number;
} {
  const snapR = SNAP_FRAC * BODY_H * scale;
  let near = nearestTarget(p, scale);
  let hit = !!near && near.dist < snapR;
  if (!hit) {
    const fig = figureUnder(p, scale);
    if (fig) {
      near = nearestTarget(p, scale, fig);
      hit = !!near;
    }
  }
  return { near, hit, snapR };
}

/** Closest off-body zone to a free drop point — gives a free placement a
 *  readable location for the parts list ("Behind me", "Above the head"…). */
export function nearestOffZone(p: XYPosition, bodyScale: number): string {
  let bestKey = "off-front";
  let bestD = Infinity;
  for (const r of REGIONS) {
    if (!r.offBody) continue;
    const a = offBodySuggestion(r, bodyScale);
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d < bestD) {
      bestD = d;
      bestKey = r.key;
    }
  }
  return bestKey;
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
