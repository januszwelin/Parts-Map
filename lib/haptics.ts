/* ════════════════════════════════════════════════════════════════════
   HAPTICS — a tiny, independent feedback channel
   ════════════════════════════════════════════════════════════════════

   Mirrors the touch points that already play a sound (lift, drop, free
   set-down, magnet tick) but stays deliberately separate from lib/sound.ts:
   it's stateless (no context, no mute state) and lives on a different
   output — vibration keeps speaking on a silenced phone, which is the
   common case for a contemplative tool used in a quiet room. */

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
