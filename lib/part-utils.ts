/* ════════════════════════════════════════════════════════════════════
   PART HELPERS — small pure lookups shared by cards, panels, and the app
   ════════════════════════════════════════════════════════════════════ */

import { REGION_BY_KEY } from "@/lib/regions";
import type { Depth, FontSize, Part, Shape } from "@/lib/types";

export const regionLabel = (key: string) => REGION_BY_KEY[key]?.label ?? key;
export const partIsBack = (p: Part) =>
  !p.offBody && (p.depth === "back" || !!REGION_BY_KEY[p.location]?.isBack);

/** Which body surface the part sits on. */
export const partSurface = (p: Part): Depth =>
  partIsBack(p) ? "back" : "front";

export const FONT_PX: Record<FontSize, number> = { s: 12, m: 14, l: 17 };
export const SHAPE_RADIUS: Record<Shape, string> = {
  rounded: "14px",
  square: "5px",
  pill: "999px",
  ellipse: "50%",
};

/** How a part's location reads as text (list + popover + export). */
export function locationDisplay(p: Part): string {
  const region = REGION_BY_KEY[p.location];
  if (!region) return p.location;
  if (!p.offBody && p.depth === "back" && !region.isBack) {
    return `${region.label} (back)`;
  }
  return region.label;
}
