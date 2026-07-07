"use client";

import React from "react";
import type { Arrow, Depth, Part } from "@/lib/types";

/** Imperative API handed down to nodes/edges/panels via context so the
 *  single parts array stays the only source of truth. */
export type AppApi = {
  updatePart: (id: string, patch: Partial<Part>) => void;
  deletePart: (id: string) => void;
  /** Text-authoritative location edit. Returns false when nothing matched. */
  setLocationText: (id: string, text: string) => boolean;
  /** Flip an on-body part between the front and back surface of its own
   *  region (valid only where the region has both) — glides like a drop. */
  setDepth: (id: string, depth: Depth) => void;
  endResize: (id: string) => void;
  updateArrow: (id: string, patch: Partial<Arrow>) => void;
  /** Draw an arrow between two parts by id — the pointer-free counterpart
   *  to dragging a connect dot, so the relationships that are the point of
   *  the tool are reachable by keyboard/switch users too. No-ops on a
   *  self-link or an exact duplicate. */
  connectParts: (sourceId: string, targetId: string) => void;
  /** Swap an arrow's source and target — IFS direction ("who protects
   *  whom") matters, and this beats delete-and-redraw. */
  reverseArrow: (id: string) => void;
  deleteArrow: (id: string) => void;
  /** Select an arrow (opens its popover) — used by the label pill. */
  selectArrow: (id: string) => void;
  /** The drag loop writes tilt/lag transforms straight to each card's
   *  inner element; nodes register those elements here. */
  registerPartInner: (id: string, el: HTMLDivElement | null) => void;
};

export const AppApiContext = React.createContext<AppApi | null>(null);
export const useAppApi = () => {
  const api = React.useContext(AppApiContext);
  if (!api) throw new Error("AppApiContext missing");
  return api;
};

/** The live parts array, exposed to the editor's "draw arrow to…" picker
 *  so it can list link targets. Deliberately separate from AppApi (which
 *  is a stable bag of callbacks): this value changes on every edit, so
 *  only the components that actually need the list subscribe to it —
 *  keeping it out of node `data` preserves PartNode's memoization. */
export const PartsListContext = React.createContext<Part[]>([]);
export const usePartsList = () => React.useContext(PartsListContext);
