/* ════════════════════════════════════════════════════════════════════
   HAPTICS — the app's feedback channel
   ════════════════════════════════════════════════════════════════════

   The only feedback the touch points (lift, drop, free set-down, magnet
   tick) emit: stateless (no context, no mute state), and vibration keeps
   speaking on a silenced phone — the common case for a contemplative
   tool used in a quiet room. (Sound cues were retired 2026-07; lib/sound.ts
   is kept on disk, unimported, in case they return.)

   Vocabulary — keep new call sites in this register:
   • creation / placement / flip (add 6, arrow 6, landing 8, view flip 6)
     get a real buzz — something changed on the map;
   • undo/redo, refusals and dismissals (4 / 3 / 3) get a faint tick —
     an answer, not an event;
   • style scrubbing (color, size, shape) stays silent — continuous
     adjustment must never rattle. */

import { TICK_MIN_MS } from "@/lib/tuning";

export function haptic(ms = 8): void {
  if (typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported or blocked — silently no-op */
  }
}

export function hapticsSupported(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

/** Rate-limited magnet feedback — one faint tick per TICK_MIN_MS at most.
 *  The caller owns the `lastTickAt` slot (per-drag aim state); this stays
 *  stateless. */
export function hapticTick(aim: { lastTickAt: number }, ms: number): void {
  const t = performance.now();
  if (t - aim.lastTickAt < TICK_MIN_MS) return;
  aim.lastTickAt = t;
  haptic(ms);
}
