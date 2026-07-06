/* ════════════════════════════════════════════════════════════════════
   LOCATION MATCHER  (the AI seam)
   ════════════════════════════════════════════════════════════════════
   v1 is a plain text matcher. To upgrade: replace interpretLocations
   with a batched model call (e.g. Claude Sonnet) returning the same
   Placement[] shape. Nothing else changes. */

import {
  REGIONS,
  REGION_BY_KEY,
  SYNONYMS,
  type RegionDef,
} from "@/lib/regions";
import type { Depth, Placement } from "@/lib/types";
import { offBodySuggestion } from "@/lib/geometry";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Match free location text to a region. Returns null when nothing fits. */
export function matchRegion(text: string): { key: string; depth: Depth } | null {
  const t = normalize(text);
  if (!t) return null;

  const side: "right" | "left" | null = /\bright\b/.test(t)
    ? "right"
    : /\bleft\b/.test(t)
      ? "left"
      : null;

  const sided = (key: string) => {
    if (!side) return key;
    const swapped = key.replace(/-(right|left)$/, `-${side}`);
    return REGION_BY_KEY[swapped] ? swapped : key;
  };

  // "solar plexus (back)" / "back of the heart" → the paired back region,
  // or the same region at back depth. No-op for regions already on the back.
  const wantsBack = /\bback\b/.test(t);
  const finalize = (rawKey: string): { key: string; depth: Depth } => {
    const key = sided(rawKey);
    const r = REGION_BY_KEY[key];
    if (r.isBack) return { key, depth: "back" };
    if (wantsBack && !r.offBody) {
      if (r.backKey) return { key: r.backKey, depth: "back" };
      return { key, depth: "back" };
    }
    return { key, depth: "front" };
  };

  // 1. Exact / substring label match (longest label wins).
  let best: RegionDef | null = null;
  for (const r of REGIONS) {
    const label = normalize(r.label);
    if (label === t) return finalize(r.key);
    if (
      (t.includes(label) || label.includes(t)) &&
      (!best || label.length > normalize(best.label).length)
    ) {
      best = r;
    }
  }
  if (best) return finalize(best.key);

  // 2. Synonym phrases, longest first.
  const phrases = Object.keys(SYNONYMS).sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    if (t.includes(phrase)) return finalize(SYNONYMS[phrase]);
  }

  // 3. Token-overlap scoring against labels.
  const tokens = new Set(t.split(" "));
  let bestScore = 0;
  let bestKey: string | null = null;
  for (const r of REGIONS) {
    const ltokens = normalize(r.label).split(/[\s/]+/);
    const score = ltokens.filter((w) => tokens.has(w)).length / ltokens.length;
    if (score > bestScore) {
      bestScore = score;
      bestKey = r.key;
    }
  }
  if (bestKey && bestScore >= 0.5) return finalize(bestKey);
  return null;
}

/** Batch interpretation seam. Swap this implementation for an AI call
 *  (e.g. Claude Sonnet) returning the same Placement[] shape. Unmatched
 *  lines return offBody with no freePos — the caller trays them. */
export function interpretLocations(
  lines: { name: string; locationText?: string }[],
  bodyScale: number,
): Placement[] {
  return lines.map((line) => {
    const m = line.locationText ? matchRegion(line.locationText) : null;
    if (!m) return { location: "off-free", depth: "front", offBody: true };
    const region = REGION_BY_KEY[m.key];
    if (region.offBody) {
      return {
        location: m.key,
        depth: "front",
        offBody: true,
        freePos: offBodySuggestion(region, bodyScale),
      };
    }
    return { location: m.key, depth: m.depth, offBody: false };
  });
}

/** Parse pasted import text: one part per line; optional second column
 *  (location) split on tab, comma, em-dash, " - ", or 2+ spaces. */
export function parseImportText(
  text: string,
): { name: string; locationText?: string }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.split(/\t|,|—| - |\s{2,}/);
      const name = (m[0] ?? "").trim();
      const locationText = m.slice(1).join(" ").trim() || undefined;
      return { name, locationText };
    })
    .filter((l) => l.name);
}
