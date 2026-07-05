/* ════════════════════════════════════════════════════════════════════
   EXPORTS — clipboard text flowchart + PNG flowchart download
   ════════════════════════════════════════════════════════════════════ */

import type { Arrow, Part } from "@/lib/types";

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

  const colors = [...new Set(edges.map((a) => a.color))];
  const markerId = new Map(colors.map((c, i) => [c, `fc-arrow-${i}`]));
  const defs = colors
    .map(
      (c) =>
        `<marker id="${markerId.get(c)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`,
    )
    .join("");

  const pieces: string[] = [];
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
      `<path d="${d}" fill="none" stroke="${a.color}" stroke-width="2" marker-end="url(#${markerId.get(a.color)})"/>`,
    );
    if (a.label) {
      const label = escapeXml(a.label);
      const pw = Math.ceil(measure(a.label, 11)) + 16;
      pieces.push(
        `<rect x="${mid.x - pw / 2}" y="${mid.y - 9}" width="${pw}" height="18" rx="9" fill="#fdfcfa" stroke="#e4e0d8"/>`,
        `<text x="${mid.x}" y="${mid.y}" text-anchor="middle" dominant-baseline="central" font-family="${FLOW_FONT_STACK}" font-size="11" fill="#6f6a62">${label}</text>`,
      );
    }
  }
  // nodes above edges' lines but below nothing else
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
    `</svg>`;
  return { svg, w, h };
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
  const url = URL.createObjectURL(
    new Blob([built.svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg decode failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = built.w * 2;
    canvas.height = built.h * 2;
    const c = canvas.getContext("2d");
    if (!c) return false;
    c.scale(2, 2);
    c.drawImage(img, 0, 0);
    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!png) return false;
    const dl = URL.createObjectURL(png);
    const a = document.createElement("a");
    a.href = dl;
    a.download = "parts-map-flowchart.png";
    a.click();
    URL.revokeObjectURL(dl);
    return true;
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}
