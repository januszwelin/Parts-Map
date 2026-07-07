/* ════════════════════════════════════════════════════════════════════
   TYPES — the core data model
   ════════════════════════════════════════════════════════════════════ */

import type { XYPosition, Viewport } from "@xyflow/react";

export type Depth = "front" | "back";
export type Shape = "rounded" | "square" | "pill" | "ellipse";
export type FontSize = "s" | "m" | "l";

export type Part = {
  id: string;
  name: string;
  /** Canonical location: a region key. Authoritative — render x,y is
   *  derived from it (unless offBody). */
  location: string;
  depth: Depth;
  offBody: boolean;
  /** Flow-space center, used only when offBody (scaling-exempt). */
  freePos: XYPosition;
  color: string;
  fontSize: FontSize;
  bold: boolean;
  shape: Shape;
  /** Explicit card size once resized by hand. */
  w?: number;
  h?: number;
  /** Optional private note — a few words the person keeps with the part. */
  note?: string;
};

export type HandleSide = "st" | "sr" | "sb" | "sl";

export type Arrow = {
  id: string;
  sourceId: string;
  targetId: string;
  color: string;
  /** Optional short relationship label ("manages", "protects", …). */
  label?: string;
  /** Which connect dot the arrow was actually dragged from (matches the
   *  source Handle ids in part-node.tsx — st/sr/sb/sl). The target side has
   *  no equivalent: connections drop anywhere on the target card (a single
   *  full-card Handle, deliberately, so touch drops stay forgiving), so
   *  there's no target "side" to record. Undefined for arrows saved before
   *  this field existed — FloatingEdge falls back to its old center-to-center
   *  geometry for those. */
  sourceHandle?: HandleSide;
};

export type MapDoc = {
  version: 1;
  parts: Part[];
  arrows: Arrow[];
  bodyScale: number;
  autoScale: boolean;
  /** Which side of the body is facing the viewer. */
  view?: Depth;
  viewport?: Viewport;
};

export type Placement = {
  location: string;
  depth: Depth;
  offBody: boolean;
  freePos?: XYPosition;
};

let idCounter = 0;
export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;
