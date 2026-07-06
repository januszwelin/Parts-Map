/* ════════════════════════════════════════════════════════════════════
   SAMPLE MAP — the "Explore an example" starter system
   ════════════════════════════════════════════════════════════════════

   A tiny, gentle IFS system a newcomer can react to instead of a bare
   outline. It shows off the whole vocabulary at once: on-body placement on
   front-surface regions, an off-body part, labeled relationships, a note,
   and Self resting at the heart. Ids are minted fresh on each call so
   loading the example twice never collides. */

import { BODY_W, BODY_H, PALETTE, ARROW_COLORS } from "@/lib/tuning";
import { newId, type MapDoc } from "@/lib/types";

export function sampleMap(): MapDoc {
  const self = newId("part");
  const critic = newId("part");
  const child = newId("part");
  const protector = newId("part");
  const watcher = newId("part");
  const offRight = { x: BODY_W * 1.35, y: BODY_H * 0.08 };
  return {
    version: 1,
    parts: [
      {
        id: self,
        name: "Self",
        location: "heart",
        depth: "front",
        offBody: false,
        freePos: { x: BODY_W, y: 0 },
        color: PALETTE[2],
        fontSize: "m",
        bold: true,
        shape: "rounded",
      },
      {
        id: critic,
        name: "Inner Critic",
        location: "forehead-center",
        depth: "front",
        offBody: false,
        freePos: { x: BODY_W, y: 0 },
        color: PALETTE[1],
        fontSize: "m",
        bold: false,
        shape: "rounded",
      },
      {
        id: child,
        name: "Vulnerable Child",
        location: "lower-belly",
        depth: "front",
        offBody: false,
        freePos: { x: BODY_W, y: 0 },
        color: PALETTE[3],
        fontSize: "m",
        bold: false,
        shape: "rounded",
        note: "Feels small and unseen.",
      },
      {
        id: protector,
        name: "Protector",
        location: "chest-right",
        depth: "front",
        offBody: false,
        freePos: { x: BODY_W, y: 0 },
        color: PALETTE[0],
        fontSize: "m",
        bold: false,
        shape: "rounded",
      },
      {
        id: watcher,
        name: "The Watcher",
        location: "off-front",
        depth: "front",
        offBody: true,
        freePos: offRight,
        color: PALETTE[5],
        fontSize: "m",
        bold: false,
        shape: "pill",
      },
    ],
    arrows: [
      {
        id: newId("arrow"),
        sourceId: protector,
        targetId: child,
        color: ARROW_COLORS[0],
        label: "protects",
      },
      {
        id: newId("arrow"),
        sourceId: critic,
        targetId: child,
        color: ARROW_COLORS[1],
        label: "manages",
      },
      {
        id: newId("arrow"),
        sourceId: self,
        targetId: critic,
        color: ARROW_COLORS[2],
        label: "curious about",
      },
    ],
    bodyScale: 1,
    autoScale: true,
    view: "front",
  };
}
