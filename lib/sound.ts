/* ════════════════════════════════════════════════════════════════════
   SOUND — synthesized UI audio (no assets)
   ════════════════════════════════════════════════════════════════════

   Tiny, warm, very quiet cues for the magnet and landings, synthesized
   through one lazy AudioContext. Everything routes through a master
   gain + gentle lowpass so the palette stays soft. iOS never grants
   user activation to rAF code, so one-time window gesture listeners
   resume the context (and revive it after tab switches / iOS audio
   interruptions). */

import { TICK_MIN_MS } from "@/lib/tuning";

type SndState = {
  muted: boolean;
  ctx: AudioContext | null;
  master: GainNode | null;
};

/** Stashed on globalThis so dev HMR re-evals reuse one AudioContext
 *  (browsers cap live contexts per page). */
const sndState: SndState = (() => {
  const g = globalThis as { __pmSnd?: SndState };
  if (!g.__pmSnd) g.__pmSnd = { muted: false, ctx: null, master: null };
  return g.__pmSnd;
})();

function sndCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sndState.ctx) {
    const AC =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.6;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 4200;
    master.connect(lp);
    lp.connect(ctx.destination);
    sndState.ctx = ctx;
    sndState.master = master;
    const unlock = () => {
      if (ctx.state !== "running") {
        ctx.resume().catch(() => {});
        // Older iOS also wants one (silent) buffer played from a gesture.
        try {
          const s = ctx.createBufferSource();
          s.buffer = ctx.createBuffer(1, 1, 22050);
          s.connect(ctx.destination);
          s.start(0);
        } catch {
          /* ignore */
        }
      }
    };
    for (const ev of ["pointerdown", "pointerup", "touchend", "keydown"]) {
      window.addEventListener(ev, unlock, { capture: true, passive: true });
    }
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) unlock();
    });
    ctx.onstatechange = () => {
      if ((ctx.state as string) === "interrupted") unlock();
    };
  }
  return sndState.ctx;
}

/** One enveloped oscillator into the master bus. */
function sndVoice(
  ctx: AudioContext,
  type: OscillatorType,
  f0: number,
  f1: number,
  peak: number,
  dur: number,
) {
  const master = sndState.master;
  if (!master) return;
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function sndPlay(kind: "lift" | "tick" | "drop" | "free") {
  if (sndState.muted) return;
  const ctx = sndCtx();
  if (!ctx || ctx.state !== "running") return;
  switch (kind) {
    case "lift":
      // Pickup: a soft rising blip.
      sndVoice(ctx, "sine", 300, 380, 0.028, 0.07);
      break;
    case "tick": {
      // Magnet handover/commit: a short wooden tap, slightly detuned
      // each time so repeats feel organic.
      const f = 1500 * (0.96 + Math.random() * 0.08);
      sndVoice(ctx, "triangle", f, f, 0.02, 0.018);
      break;
    }
    case "drop":
      // Landing: a warm two-partial thump with a tiny contact click.
      sndVoice(ctx, "sine", 196, 174, 0.06, 0.16);
      sndVoice(ctx, "sine", 392, 392, 0.025, 0.07);
      sndVoice(ctx, "triangle", 900, 900, 0.012, 0.012);
      break;
    case "free":
      // Off-body set-down: lower, shorter, quieter.
      sndVoice(ctx, "sine", 150, 140, 0.035, 0.1);
      break;
  }
}

export function sndSetMuted(m: boolean) {
  sndState.muted = m;
}

/** Rate-limited magnet feedback — one soft tick + a faint haptic. */
export function magnetTick(aim: { lastTickAt: number }, vib: number) {
  const t = performance.now();
  if (t - aim.lastTickAt < TICK_MIN_MS) return;
  aim.lastTickAt = t;
  sndPlay("tick");
  navigator.vibrate?.(vib);
}
