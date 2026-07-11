/* ════════════════════════════════════════════════════════════════════
   EXPORTS — shareable map text (native share sheet with clipboard
   fallback) + PNG flowchart/map downloads and shares
   ════════════════════════════════════════════════════════════════════ */

import type { Arrow, Part, Depth } from "@/lib/types";
import type { XYPosition } from "@xyflow/react";
import { BODY_H, BODY_W, ARROW_INK } from "@/lib/tuning";
import { derivePositions, rectEdgePoint } from "@/lib/geometry";
import { BODY_PATHS, BODY_BACK_DETAIL } from "@/lib/body-paths";
import {
  FONT_PX,
  SHAPE_RADIUS,
  partIsBack,
  locationDisplay,
} from "@/lib/part-utils";

/** Clipboard write with a legacy fallback (non-secure contexts, denied
 *  permission). Resolves true only when the text actually copied — the
 *  "copied ✓" feedback must never lie. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** All arrows as a copyable text flowchart, one relationship per line:
 *  `[Source] -> label -> [Target]` (or `[Source] -> [Target]` when
 *  unlabeled). Ordered as a readable tree — roots first (parts that are
 *  sources but never targets), walked depth-first; anything cyclic or
 *  detached follows. Parts with no arrows are omitted. */
export function relationshipsText(parts: Part[], arrows: Arrow[]): string {
  const nameOf = new Map(parts.map((p) => [p.id, p.name]));
  const bySource = new Map<string, Arrow[]>();
  for (const a of arrows) {
    const list = bySource.get(a.sourceId);
    if (list) list.push(a);
    else bySource.set(a.sourceId, [a]);
  }
  const line = (a: Arrow) => {
    const src = nameOf.get(a.sourceId) ?? "?";
    const tgt = nameOf.get(a.targetId) ?? "?";
    return a.label
      ? `[${src}] -> ${a.label} -> [${tgt}]`
      : `[${src}] -> [${tgt}]`;
  };
  const emitted = new Set<string>();
  const lines: string[] = [];
  const walk = (partId: string) => {
    for (const a of bySource.get(partId) ?? []) {
      if (emitted.has(a.id)) continue;
      emitted.add(a.id);
      lines.push(line(a));
      walk(a.targetId);
    }
  };
  const targets = new Set(arrows.map((a) => a.targetId));
  for (const a of arrows) {
    if (!targets.has(a.sourceId)) walk(a.sourceId);
  }
  for (const a of arrows) {
    if (!emitted.has(a.id)) {
      emitted.add(a.id);
      lines.push(line(a));
      walk(a.targetId);
    }
  }
  return lines.join("\n");
}

/** The whole map as one readable, shareable text: every part with its
 *  location (and note), then the relationship lines from
 *  `relationshipsText`. One payload for the native share sheet or the
 *  clipboard — replaces the old separate "copy list" and "copy
 *  relationships" actions. */
export function mapText(parts: Part[], arrows: Arrow[]): string {
  const head = `My parts map — ${parts.length} part${parts.length === 1 ? "" : "s"}`;
  const rows = parts.map((p) => {
    const note = p.note ? ` · ${p.note}` : "";
    return `${p.name} — ${locationDisplay(p)}${note}`;
  });
  const rel = relationshipsText(parts, arrows);
  return [head, "", ...rows, ...(rel ? ["", "Relationships:", rel] : [])].join(
    "\n",
  );
}

/** Hand text to the OS share sheet where one exists (phones), falling
 *  back to the clipboard. "cancelled" means the person closed the share
 *  sheet themselves — not a failure, callers stay quiet about it. */
export async function shareText(
  text: string,
): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return "cancelled";
      }
      // NotAllowedError and friends — fall through to the clipboard.
    }
  }
  return (await copyText(text)) ? "copied" : "failed";
}

/* ——— Flowchart PNG export ———
   A layered top-down drawing of the relationship graph: part cards in
   their colors, arrows in their colors with midpoint label pills. Same
   conventions as the text export — roots first, parts with no arrows
   omitted. All colors are literals (the SVG is rasterized outside the
   page, where CSS variables don't exist). */

const FLOW_NODE_H = 44;
const FLOW_H_GAP = 48;
const FLOW_V_GAP = 72;
const FLOW_MARGIN = 32;
const FLOW_FONT_STACK = "ui-sans-serif, system-ui, sans-serif";

type FlowNode = {
  part: Part;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Layered layout: roots (sources never targets) on top, each edge
 *  pushing its target below its source (back-edges in cycles are left
 *  where they are), one barycenter pass to reduce crossings. */
function layoutFlowchart(
  parts: Part[],
  arrows: Arrow[],
  measure: (text: string, px: number) => number,
): { nodes: FlowNode[]; byId: Map<string, FlowNode>; edges: Arrow[] } {
  const connected = new Set<string>();
  for (const a of arrows) {
    connected.add(a.sourceId);
    connected.add(a.targetId);
  }
  const included = parts.filter((p) => connected.has(p.id));
  const partById = new Map(included.map((p) => [p.id, p]));
  const edges = arrows.filter(
    (a) => partById.has(a.sourceId) && partById.has(a.targetId),
  );

  const bySource = new Map<string, Arrow[]>();
  for (const a of edges) {
    const list = bySource.get(a.sourceId);
    if (list) list.push(a);
    else bySource.set(a.sourceId, [a]);
  }

  // Longest-path layering by DFS from the roots; the on-stack guard
  // skips back-edges, so cycles keep their first assigned layer.
  const layerOf = new Map<string, number>();
  const onStack = new Set<string>();
  const assign = (id: string, l: number) => {
    if (onStack.has(id)) return;
    if ((layerOf.get(id) ?? -1) >= l) return;
    layerOf.set(id, l);
    onStack.add(id);
    for (const a of bySource.get(id) ?? []) assign(a.targetId, l + 1);
    onStack.delete(id);
  };
  const targets = new Set(edges.map((a) => a.targetId));
  for (const p of included) if (!targets.has(p.id)) assign(p.id, 0);
  for (const p of included) if (!layerOf.has(p.id)) assign(p.id, 0);

  // Compact layer values into contiguous rows.
  const layerVals = [...new Set(layerOf.values())].sort((a, b) => a - b);
  const rowIdx = new Map(layerVals.map((v, i) => [v, i]));
  const rows: string[][] = layerVals.map(() => []);
  for (const p of included) rows[rowIdx.get(layerOf.get(p.id)!)!].push(p.id);
  const nameOf = (id: string) => partById.get(id)!.name;
  for (const row of rows) row.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  // One barycenter pass: order each row under the mean position of its
  // parents in the row above.
  const parentsOf = new Map<string, string[]>();
  for (const a of edges) {
    const list = parentsOf.get(a.targetId);
    if (list) list.push(a.sourceId);
    else parentsOf.set(a.targetId, [a.sourceId]);
  }
  for (let r = 1; r < rows.length; r++) {
    const above = new Map(rows[r - 1].map((id, i) => [id, i]));
    const bary = (id: string) => {
      const ps = (parentsOf.get(id) ?? [])
        .map((p) => above.get(p))
        .filter((v): v is number => v !== undefined);
      return ps.length ? ps.reduce((s, v) => s + v, 0) / ps.length : 1e9;
    };
    rows[r].sort(
      (a, b) => bary(a) - bary(b) || nameOf(a).localeCompare(nameOf(b)),
    );
  }

  // Size cards to their names (ellipsized past a cap), center each row.
  const nodes: FlowNode[] = [];
  const byId = new Map<string, FlowNode>();
  rows.forEach((row, r) => {
    const sized = row.map((id) => {
      let label = partById.get(id)!.name;
      let w = measure(label, 14) + 36;
      while (w > 240 && label.length > 2) {
        label = label.slice(0, -2).trimEnd() + "…";
        w = measure(label, 14) + 36;
      }
      return { id, label, w: Math.max(90, Math.ceil(w)) };
    });
    const total =
      sized.reduce((s, n) => s + n.w, 0) + FLOW_H_GAP * (sized.length - 1);
    let x = -total / 2;
    for (const s of sized) {
      const node: FlowNode = {
        part: partById.get(s.id)!,
        label: s.label,
        x,
        y: r * (FLOW_NODE_H + FLOW_V_GAP),
        w: s.w,
        h: FLOW_NODE_H,
      };
      nodes.push(node);
      byId.set(s.id, node);
      x += s.w + FLOW_H_GAP;
    }
  });
  return { nodes, byId, edges };
}

const escapeXml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** The relationship graph as a self-contained SVG string (no CSS vars,
 *  no external refs — safe to rasterize). Null when there are no arrows. */
function flowchartSvg(
  parts: Part[],
  arrows: Arrow[],
): { svg: string; w: number; h: number } | null {
  const ctx = document.createElement("canvas").getContext("2d");
  const measure = (text: string, px: number) => {
    if (!ctx) return text.length * px * 0.55;
    ctx.font = `${px}px ${FLOW_FONT_STACK}`;
    return ctx.measureText(text).width;
  };
  const { nodes, byId, edges } = layoutFlowchart(parts, arrows, measure);
  if (!nodes.length) return null;

  const minX = Math.min(...nodes.map((n) => n.x)) - FLOW_MARGIN;
  const maxX = Math.max(...nodes.map((n) => n.x + n.w)) + FLOW_MARGIN;
  const maxY = Math.max(...nodes.map((n) => n.y + n.h)) + FLOW_MARGIN;
  const w = Math.ceil(maxX - minX);
  const h = Math.ceil(maxY + FLOW_MARGIN);
  const ox = -minX; // shift into positive coordinates
  const oy = FLOW_MARGIN;

  // Arrows are black-only now — one shared marker instead of one per color.
  const defs = `<marker id="fc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${ARROW_INK}"/></marker>`;

  const pieces: string[] = [];
  // Arrow labels are collected separately and painted last (above the node
  // cards) — otherwise a card overlapping an arrow's midpoint hides its
  // label, since SVG paints in document order.
  const labelPieces: string[] = [];
  for (const a of edges) {
    const s = byId.get(a.sourceId)!;
    const t = byId.get(a.targetId)!;
    let d: string;
    let mid: { x: number; y: number };
    if (t.y > s.y) {
      // downward: smooth vertical cubic, bottom center → top center
      const x0 = ox + s.x + s.w / 2;
      const y0 = oy + s.y + s.h;
      const x1 = ox + t.x + t.w / 2;
      const y1 = oy + t.y;
      const k = Math.max(24, (y1 - y0) * 0.4);
      d = `M${x0} ${y0} C${x0} ${y0 + k}, ${x1} ${y1 - k}, ${x1} ${y1}`;
      mid = {
        x: (x0 + x1) / 2,
        y: (y0 + 3 * (y0 + k) + 3 * (y1 - k) + y1) / 8,
      };
    } else {
      // back / same-layer edge (a cycle): bow around the right side
      const x0 = ox + s.x + s.w;
      const y0 = oy + s.y + s.h / 2;
      const x1 = ox + t.x + t.w;
      const y1 = oy + t.y + t.h / 2;
      const k = 64;
      d = `M${x0} ${y0} C${x0 + k} ${y0}, ${x1 + k} ${y1}, ${x1} ${y1}`;
      mid = { x: (x0 + 3 * (x0 + k) + 3 * (x1 + k) + x1) / 8, y: (y0 + y1) / 2 };
    }
    pieces.push(
      `<path d="${d}" fill="none" stroke="${ARROW_INK}" stroke-width="2" marker-end="url(#fc-arrow)"/>`,
    );
    if (a.label) {
      const label = escapeXml(a.label);
      const pw = Math.ceil(measure(a.label, 11)) + 16;
      labelPieces.push(
        `<rect x="${mid.x - pw / 2}" y="${mid.y - 9}" width="${pw}" height="18" rx="9" fill="#fdfcfa" stroke="#e4e0d8"/>`,
        `<text x="${mid.x}" y="${mid.y}" text-anchor="middle" dominant-baseline="central" font-family="${FLOW_FONT_STACK}" font-size="11" fill="#6f6a62">${label}</text>`,
      );
    }
  }
  // nodes above the edge lines…
  for (const n of nodes) {
    pieces.push(
      `<rect x="${ox + n.x}" y="${oy + n.y}" width="${n.w}" height="${n.h}" rx="14" fill="${n.part.color}" stroke="rgba(58,55,51,0.08)"/>`,
      `<text x="${ox + n.x + n.w / 2}" y="${oy + n.y + n.h / 2}" text-anchor="middle" dominant-baseline="central" font-family="${FLOW_FONT_STACK}" font-size="14" fill="#3a3733">${escapeXml(n.label)}</text>`,
    );
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs>${defs}</defs>` +
    `<rect width="${w}" height="${h}" fill="#f7f5f1"/>` +
    pieces.join("") +
    // …and arrow labels above the nodes, so they're never occluded.
    labelPieces.join("") +
    `</svg>`;
  return { svg, w, h };
}

/** Rasterize an SVG string to a 2× PNG blob — null on any failure.
 *  Shared by the download and native-share paths below. */
async function svgToPngBlob(
  svg: string,
  w: number,
  h: number,
): Promise<Blob | null> {
  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg decode failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w * 2;
    canvas.height = h * 2;
    const c = canvas.getContext("2d");
    if (!c) return null;
    c.scale(2, 2);
    c.drawImage(img, 0, 0);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function downloadBlob(blob: Blob, filename: string): boolean {
  try {
    const dl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(dl);
    return true;
  } catch {
    return false;
  }
}

/** Rasterize an SVG string at 2× and download it as a PNG. Resolves true
 *  only when the file was actually handed to the browser — the "exported
 *  ✓" feedback must never lie. */
async function rasterizeSvgToPng(
  svg: string,
  w: number,
  h: number,
  filename: string,
): Promise<boolean> {
  const png = await svgToPngBlob(svg, w, h);
  return png ? downloadBlob(png, filename) : false;
}

/** Hand a rasterized PNG to the OS share sheet (phones — save to Photos,
 *  message it on…); where files can't be shared, fall back to a plain
 *  download so the action never dead-ends. "cancelled" = the person
 *  closed the share sheet, not a failure. */
async function sharePng(
  svg: string,
  w: number,
  h: number,
  filename: string,
): Promise<"shared" | "downloaded" | "cancelled" | "failed"> {
  const png = await svgToPngBlob(svg, w, h);
  if (!png) return "failed";
  const file = new File([png], filename, { type: "image/png" });
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return "cancelled";
      }
      // fall through to the download
    }
  }
  return downloadBlob(png, filename) ? "downloaded" : "failed";
}

/** Rasterize the flowchart SVG at 2× and download it as a PNG. Resolves
 *  true only when the file was actually handed to the browser — the
 *  "exported ✓" feedback must never lie. */
export async function downloadFlowchartPng(
  parts: Part[],
  arrows: Arrow[],
): Promise<boolean> {
  const built = flowchartSvg(parts, arrows);
  if (!built) return false;
  return rasterizeSvgToPng(built.svg, built.w, built.h, "parts-map-flowchart.png");
}

/** Share the flowchart PNG via the OS share sheet (download fallback). */
export async function shareFlowchartPng(
  parts: Part[],
  arrows: Arrow[],
): Promise<"shared" | "downloaded" | "cancelled" | "failed"> {
  const built = flowchartSvg(parts, arrows);
  if (!built) return "failed";
  return sharePng(built.svg, built.w, built.h, "parts-map-flowchart.png");
}

/* ——— Spatial map-image export ———
   Unlike the flowchart above (an abstract top-down relationship diagram),
   this draws what the person actually built: parts on the single body
   silhouette for the active view, in their real positions — the same
   geometry the live canvas uses (derivePositions, the traced body paths),
   redrawn as a flat SVG so it can be rasterized outside the page. Colors
   are literals for the same reason as the flowchart export. */

const MAP_MARGIN = 48;
const MAP_CARD_H = 44;
const MAP_CARD_MIN_W = 92;
const MAP_CARD_MAX_W = 200;
const MAP_CARD_PAD_X = 16;
const MAP_GAP = 6; // matches ARROW_GAP in floating-edge.tsx

type MapCard = { part: Part; label: string; pos: XYPosition; w: number; h: number };

function mapSvg(
  parts: Part[],
  arrows: Arrow[],
  bodyScale: number,
  view: Depth,
): { svg: string; w: number; h: number } | null {
  if (!parts.length) return null;
  const ctx = document.createElement("canvas").getContext("2d");
  const measure = (text: string, px: number) => {
    if (!ctx) return text.length * px * 0.55;
    ctx.font = `${px}px ${FLOW_FONT_STACK}`;
    return ctx.measureText(text).width;
  };

  const posMap = derivePositions(parts, bodyScale, view);
  // Only the shown surface: off-body cards plus on-body cards whose surface
  // is the active view (parked cards are omitted from the snapshot).
  const shown = parts.filter(
    (p) => p.offBody || (partIsBack(p) ? "back" : "front") === view,
  );
  const cards: MapCard[] = shown.map((p) => {
    const pos = posMap.get(p.id) ?? { x: 0, y: 0 };
    const px = FONT_PX[p.fontSize];
    let label = p.name;
    let w = p.w ?? Math.max(MAP_CARD_MIN_W, measure(label, px) + MAP_CARD_PAD_X * 2);
    if (!p.w) {
      w = Math.min(MAP_CARD_MAX_W, w);
      while (w === MAP_CARD_MAX_W && measure(label, px) + MAP_CARD_PAD_X * 2 > w && label.length > 2) {
        label = label.slice(0, -2).trimEnd() + "…";
      }
    }
    const h = p.h ?? MAP_CARD_H;
    return { part: p, label, pos, w, h };
  });
  const cardById = new Map(cards.map((c) => [c.part.id, c]));

  // Bounds: the single body box (always — the body is context even for an
  // all-off-body map) plus every card's full extent.
  const half = (BODY_H * bodyScale) / 2;
  const figHalfW = (BODY_W * bodyScale) / 2;
  let minX = -figHalfW;
  let maxX = figHalfW;
  let minY = -half;
  let maxY = half;
  for (const c of cards) {
    minX = Math.min(minX, c.pos.x - c.w / 2);
    maxX = Math.max(maxX, c.pos.x + c.w / 2);
    minY = Math.min(minY, c.pos.y - c.h / 2);
    maxY = Math.max(maxY, c.pos.y + c.h / 2);
  }
  const captionH = 24;
  minX -= MAP_MARGIN;
  maxX += MAP_MARGIN;
  minY -= MAP_MARGIN;
  maxY += MAP_MARGIN + captionH;
  const w = Math.ceil(maxX - minX);
  const h = Math.ceil(maxY - minY);
  const ox = -minX;
  const oy = -minY;

  const bodyStroke = 'fill="none" stroke="#3a3733" stroke-opacity="0.35" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  const figureSvg = (depth: "front" | "back") => {
    const cx = ox; // single body centered at flow x = 0
    const cy = oy;
    const s = bodyScale;
    const paths = BODY_PATHS.map((d) => `<path d="${d}" ${bodyStroke}/>`).join("");
    const backDetail =
      depth === "back"
        ? `<g opacity="0.8">${BODY_BACK_DETAIL.map((d) => `<path d="${d}" ${bodyStroke}/>`).join("")}</g>`
        : "";
    // Same transform stack as the live BodyOutline: translate to the
    // figure's center, scale by bodyScale, offset so raw path coords
    // (0..460, 0..1000) center on that point, mirroring for the back.
    const inner = depth === "back"
      ? `<g transform="translate(460,0) scale(-1,1)">${paths}${backDetail}</g>`
      : `${paths}${backDetail}`;
    const caption = depth.toUpperCase();
    return (
      `<g transform="translate(${cx} ${cy}) scale(${s})">` +
      `<g transform="translate(-230,-500)">${inner}</g>` +
      `</g>` +
      `<text x="${cx}" y="${cy + half + 20}" text-anchor="middle" font-family="${FLOW_FONT_STACK}" font-size="12" letter-spacing="2" fill="#847d72">${caption}</text>`
    );
  };

  const arrowPieces: string[] = [];
  // Labels ride above the cards (painted last) so an overlapping card can't
  // hide them — SVG paints in document order.
  const arrowLabelPieces: string[] = [];
  // Arrows are black-only now — one shared marker instead of one per color.
  const arrowDefs = `<marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${ARROW_INK}"/></marker>`;
  for (const a of arrows) {
    const sc = cardById.get(a.sourceId);
    const tc = cardById.get(a.targetId);
    if (!sc || !tc) continue;
    const sp = rectEdgePoint(
      sc.pos,
      sc.w + MAP_GAP * 2,
      sc.h + MAP_GAP * 2,
      tc.pos,
    );
    const tp = rectEdgePoint(
      tc.pos,
      tc.w + MAP_GAP * 2,
      tc.h + MAP_GAP * 2,
      sc.pos,
    );
    const mx = (sp.x + tp.x) / 2 + ox;
    const my = (sp.y + tp.y) / 2 + oy;
    arrowPieces.push(
      `<path d="M${sp.x + ox} ${sp.y + oy} L${tp.x + ox} ${tp.y + oy}" fill="none" stroke="${ARROW_INK}" stroke-width="2" marker-end="url(#map-arrow)"/>`,
    );
    if (a.label) {
      const label = escapeXml(a.label);
      const pw = Math.ceil(measure(a.label, 11)) + 16;
      arrowLabelPieces.push(
        `<rect x="${mx - pw / 2}" y="${my - 9}" width="${pw}" height="18" rx="9" fill="#fdfcfa" stroke="#e4e0d8"/>`,
        `<text x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="central" font-family="${FLOW_FONT_STACK}" font-size="11" fill="#6f6a62">${label}</text>`,
      );
    }
  }

  const cardPieces = cards.map((c) => {
    const x = c.pos.x - c.w / 2 + ox;
    const y = c.pos.y - c.h / 2 + oy;
    // SHAPE_RADIUS's "999px"/"pill" clamps to h/2 automatically once it
    // exceeds half the rect's own height — SVG's own rx-clamping rule —
    // so parsing it straight through is enough; only "50%" (ellipse)
    // needs the dedicated <ellipse> element below instead of rx.
    const r = parseFloat(SHAPE_RADIUS[c.part.shape]);
    const shape =
      c.part.shape === "ellipse"
        ? `<ellipse cx="${c.pos.x + ox}" cy="${c.pos.y + oy}" rx="${c.w / 2}" ry="${c.h / 2}" fill="${c.part.color}" stroke="rgba(58,55,51,0.08)"/>`
        : `<rect x="${x}" y="${y}" width="${c.w}" height="${c.h}" rx="${r}" fill="${c.part.color}" stroke="rgba(58,55,51,0.08)"/>`;
    const back = partIsBack(c.part)
      ? `<rect x="${c.pos.x + ox + c.w / 2 - 30}" y="${c.pos.y + oy - c.h / 2 - 10}" width="30" height="14" rx="7" fill="#6f6a62"/>` +
        `<text x="${c.pos.x + ox + c.w / 2 - 15}" y="${c.pos.y + oy - c.h / 2 - 3}" text-anchor="middle" dominant-baseline="central" font-family="${FLOW_FONT_STACK}" font-size="8" fill="#fff">back</text>`
      : "";
    return (
      shape +
      `<text x="${c.pos.x + ox}" y="${c.pos.y + oy}" text-anchor="middle" dominant-baseline="central" font-family="${FLOW_FONT_STACK}" font-size="${FONT_PX[c.part.fontSize]}" font-weight="${c.part.bold ? 600 : 400}"${c.part.underline ? ' text-decoration="underline"' : ""} fill="#3a3733">${escapeXml(c.label)}</text>` +
      back
    );
  });

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs>${arrowDefs}</defs>` +
    `<rect width="${w}" height="${h}" fill="#f7f5f1"/>` +
    figureSvg(view) +
    arrowPieces.join("") +
    cardPieces.join("") +
    // arrow labels last — above the cards, so they're never occluded.
    arrowLabelPieces.join("") +
    `</svg>`;
  return { svg, w, h };
}

/** Rasterize the spatial map (body + parts + arrows, in their real
 *  positions) at 2× and download it as a PNG — a snapshot of the actual
 *  canvas, not the abstract flowchart above. Resolves true only when the
 *  file was actually handed to the browser. */
export async function downloadMapPng(
  parts: Part[],
  arrows: Arrow[],
  bodyScale: number,
  view: Depth,
): Promise<boolean> {
  const built = mapSvg(parts, arrows, bodyScale, view);
  if (!built) return false;
  return rasterizeSvgToPng(built.svg, built.w, built.h, "parts-map.png");
}

/** Share the spatial map PNG via the OS share sheet (download fallback). */
export async function shareMapPng(
  parts: Part[],
  arrows: Arrow[],
  bodyScale: number,
  view: Depth,
): Promise<"shared" | "downloaded" | "cancelled" | "failed"> {
  const built = mapSvg(parts, arrows, bodyScale, view);
  if (!built) return "failed";
  return sharePng(built.svg, built.w, built.h, "parts-map.png");
}
