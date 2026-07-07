/* ════════════════════════════════════════════════════════════════════
   PERSISTENCE  (the seam — swap file-JSON for a backend here)
   ════════════════════════════════════════════════════════════════════ */

import {
  BODY_W,
  MIN_SCALE,
  MAX_SCALE,
  PALETTE,
  ARROW_COLORS,
} from "@/lib/tuning";
import { REGION_BY_KEY } from "@/lib/regions";
import type { XYPosition } from "@xyflow/react";
import {
  newId,
  type Part,
  type Arrow,
  type MapDoc,
  type HandleSide,
} from "@/lib/types";

function serializeMap(doc: MapDoc): string {
  return JSON.stringify(doc, null, 2);
}

/** Color is the one user-controlled field that flows straight into a live
 *  CSS `background`/SVG `fill`. An arbitrary string there is an exfiltration
 *  vector — `url(https://attacker/x)` fires a network request the moment the
 *  card renders — and an attribute-injection in the PNG export. So accept
 *  only a literal hex color; a hand-edited or hostile file falls back to a
 *  safe default (this also guards the cloud path, since the API re-parses). */
const HEX_COLOR_RE = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
function safeColor(v: unknown, fallback: string): string {
  return typeof v === "string" && HEX_COLOR_RE.test(v) ? v : fallback;
}

/** Keep only finite {x,y} — never persist extra attacker-supplied keys. */
function safeXY(v: unknown, fallback: XYPosition): XYPosition {
  if (
    v &&
    typeof v === "object" &&
    Number.isFinite((v as XYPosition).x) &&
    Number.isFinite((v as XYPosition).y)
  ) {
    const { x, y } = v as XYPosition;
    return { x, y };
  }
  return fallback;
}

/** Whitelist the camera to finite {x,y,zoom}; drop anything malformed. */
function safeViewport(v: unknown): MapDoc["viewport"] {
  if (
    v &&
    typeof v === "object" &&
    Number.isFinite((v as { x: number }).x) &&
    Number.isFinite((v as { y: number }).y) &&
    Number.isFinite((v as { zoom: number }).zoom)
  ) {
    const { x, y, zoom } = v as { x: number; y: number; zoom: number };
    return { x, y, zoom };
  }
  return undefined;
}

/** Parse + validate a saved map. Unknown regions fall back to off-body so
 *  a config rename never loses a part. Throws on malformed input. Pure
 *  and server-safe (no browser APIs) — exported so the maps API routes
 *  can heal/validate a doc before it ever reaches the database, not just
 *  file loads. */
export function parseMapJson(json: string): MapDoc {
  const raw = JSON.parse(json) as Partial<MapDoc>;
  if (!raw || !Array.isArray(raw.parts) || !Array.isArray(raw.arrows)) {
    throw new Error("Not a Parts Map file");
  }
  const parts: Part[] = raw.parts.map((p, i) => {
    const known = p.location && REGION_BY_KEY[p.location];
    const offBody = known ? !!p.offBody : true;
    return {
      id: typeof p.id === "string" ? p.id : newId("part"),
      name: typeof p.name === "string" ? p.name : `Part ${i + 1}`,
      location: known ? p.location! : "off-front",
      depth: p.depth === "back" ? "back" : "front",
      offBody,
      freePos: safeXY(p.freePos, { x: BODY_W, y: 0 }),
      color: safeColor(p.color, PALETTE[i % 8]),
      fontSize: p.fontSize === "s" || p.fontSize === "l" ? p.fontSize : "m",
      bold: !!p.bold,
      shape:
        p.shape === "square" || p.shape === "pill" || p.shape === "ellipse"
          ? p.shape
          : "rounded",
      w: typeof p.w === "number" ? p.w : undefined,
      h: typeof p.h === "number" ? p.h : undefined,
      note:
        typeof p.note === "string" && p.note.trim()
          ? p.note.trim().slice(0, 500)
          : undefined,
    };
  });
  const ids = new Set(parts.map((p) => p.id));
  const HANDLE_SIDES = new Set(["st", "sr", "sb", "sl"]);
  const safeHandle = (v: unknown): HandleSide | undefined =>
    typeof v === "string" && HANDLE_SIDES.has(v)
      ? (v as HandleSide)
      : undefined;
  const arrows: Arrow[] = raw.arrows
    .filter(
      (a) =>
        a &&
        typeof a.sourceId === "string" &&
        typeof a.targetId === "string" &&
        a.sourceId !== a.targetId &&
        ids.has(a.sourceId) &&
        ids.has(a.targetId),
    )
    .map((a) => ({
      id: typeof a.id === "string" ? a.id : newId("arrow"),
      sourceId: a.sourceId,
      targetId: a.targetId,
      color: safeColor(a.color, ARROW_COLORS[0]),
      label:
        typeof a.label === "string" && a.label.trim()
          ? a.label.trim().slice(0, 40)
          : undefined,
      sourceHandle: safeHandle(a.sourceHandle),
    }));
  return {
    version: 1,
    parts,
    arrows,
    bodyScale:
      typeof raw.bodyScale === "number"
        ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw.bodyScale))
        : 1,
    autoScale: raw.autoScale !== false,
    view: raw.view === "back" ? "back" : "front",
    viewport: safeViewport(raw.viewport),
  };
}

export function downloadMap(doc: MapDoc) {
  const blob = new Blob([serializeMap(doc)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `parts-map-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function loadMapFile(file: File): Promise<MapDoc> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseMapJson(String(reader.result)));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
