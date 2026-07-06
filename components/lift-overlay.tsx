"use client";

/* ════════════════════════════════════════════════════════════════════
   LIFT OVERLAY — the leader line, landing indicator, and pulse ring
   shown while a part is lifted (positions driven by the drag rAF loop)
   ════════════════════════════════════════════════════════════════════ */

import type React from "react";
import type { Depth } from "@/lib/types";
import { regionLabel } from "@/lib/part-utils";

/** What the lift indicator is currently pointing at (discrete state —
 *  continuous position is driven imperatively by the drag rAF loop).
 *  "moving" = the hand is in transit (too fast to be aiming): the
 *  indicator shows only a quiet dot trailing the pointer — no anchor
 *  commitment, no label, no ticks. */
export type LiftTarget =
  /** region: the landing is the region's anchor point — always. */
  | { kind: "region"; key: string; depth: Depth }
  | { kind: "free" }
  | { kind: "moving" };

/** Singletons so the per-frame state write can bail on reference
 *  equality — no re-renders while the kind is unchanged. */
export const MOVING_TARGET: LiftTarget = { kind: "moving" };
export const FREE_TARGET: LiftTarget = { kind: "free" };

export function LiftOverlay({
  target,
  touch,
  leaderRef,
  indicatorRef,
  ringRef,
}: {
  target: LiftTarget | null;
  /** On touch, the label pill flips above the dot — below it would sit
   *  between the dot and the finger. */
  touch: boolean;
  leaderRef: React.RefObject<SVGPathElement | null>;
  indicatorRef: React.RefObject<HTMLDivElement | null>;
  ringRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!target) return null;

  return (
    <div style={{ position: "absolute", zIndex: 1200, pointerEvents: "none" }}>
      {/* 1×1, not 0×0: Blink won't paint the overflow of a zero-area
          outer <svg>, so the leader line vanished in Chromium browsers
          (Firefox painted it). A 1px viewport makes Blink paint the
          overflowing path; its geometry is unchanged. */}
      <svg
        style={{ position: "absolute", overflow: "visible", left: 0, top: 0 }}
        width={1}
        height={1}
      >
        <path
          ref={leaderRef}
          className="leader-line"
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.55}
        />
      </svg>
      {/* Pulse ring: the anchor the drop will land on breathes softly.
          Persistent element, position + opacity written by the drag loop
          every frame — never React-driven, so it can't flash at the
          origin on mount. */}
      <div
        ref={ringRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          opacity: 0,
          transition: "opacity 120ms ease",
          willChange: "transform",
        }}
      >
        <div style={{ transform: "translate(-50%, -50%)" }}>
          <div
            className="anchor-pulse"
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              border: "1.5px solid var(--accent)",
            }}
          />
        </div>
      </div>
      <div
        ref={indicatorRef}
        style={{ position: "absolute", left: 0, top: 0, willChange: "transform" }}
      >
        <div
          key={
            target.kind === "region"
              ? `${target.key}:${target.depth}`
              : target.kind
          }
          className={target.kind === "moving" ? "" : "indicator-pop"}
          style={{ transform: "translate(-50%, -50%)", position: "relative" }}
        >
          {target.kind === "moving" ? (
            /* in transit: a quiet dot trailing the pointer — no claim */
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: "var(--ink-faint)",
                opacity: 0.8,
              }}
            />
          ) : target.kind === "free" ? (
            /* off-body: faint crosshair */
            <svg width={26} height={26} viewBox="0 0 26 26" style={{ display: "block" }}>
              <circle cx={13} cy={13} r={8} fill="none" stroke="var(--ink-faint)" strokeWidth={1.5} />
              <path d="M13 0v6M13 20v6M0 13h6M20 13h6" stroke="var(--ink-faint)" strokeWidth={1.5} />
            </svg>
          ) : (
            /* on-body landing preview: the anchor the drop will land on —
               full dot with halo, the pulse ring breathing around it. */
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                background: "var(--accent)",
                boxShadow: "0 0 0 3px rgba(255,255,255,0.7)",
              }}
            />
          )}
          {/* label pill (hidden in transit — nothing is being claimed) */}
          {target.kind !== "moving" && (
            <div
              className="lift-label"
              style={{
                position: "absolute",
                ...(touch
                  ? { bottom: "100%", marginBottom: 8 }
                  : { top: "100%", marginTop: 8 }),
                left: "50%",
                transform: "translateX(-50%)",
                whiteSpace: "nowrap",
                background: "var(--panel)",
                border: "1px solid var(--line)",
                boxShadow: "var(--shadow-rest)",
                borderRadius: 999,
                padding: "3px 10px",
                fontSize: 11,
                color: "var(--ink-soft)",
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              {target.kind === "free"
                ? "off body — place freely"
                : regionLabel(target.key)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
