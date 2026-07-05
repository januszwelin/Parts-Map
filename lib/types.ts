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

export type Arrow = {
  id: string;
  sourceId: string;
  targetId: string;
  color: string;
  /** Optional short relationship label ("manages", "protects", …). */
  label?: string;
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
