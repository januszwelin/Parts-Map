/* ════════════════════════════════════════════════════════════════════
   TUNING — every feel/layout constant in one place (data, editable)
   ════════════════════════════════════════════════════════════════════ */

/** Body coordinate space: normalized anchors (0–1) over a box of this
 *  aspect, rendered at BODY_H flow units tall × bodyScale, centered on
 *  flow origin (0,0). */
export const BODY_H = 1000;
const BODY_ASPECT = 0.46;
export const BODY_W = BODY_H * BODY_ASPECT;

/** Horizontal gap between the two figures (flow units, unscaled). */
export const VIEW_GAP = 150;
/** Full scene width: two figures plus the gap. */
export const SCENE_W = BODY_W * 2 + VIEW_GAP;

/** Magnet tuning, as fractions of current body height. */
export const SNAP_FRAC = 0.045; // magnet capture radius around each anchor
/** Sticky magnet: the held anchor keeps its grip until a rival anchor is
 *  decisively closer (rival dist < held dist × STICK_RIVAL) or the
 *  pointer has clearly left (held dist > snap radius × STICK_RELEASE).
 *  Kills target flicker at the midlines between crowded anchors. */
export const STICK_RIVAL = 0.72;
export const STICK_RELEASE = 1.35;

/** Aim/transit gating: above AIM_EXIT_SPD (screen px/s) the hand is in
 *  transit — the magnet stops retargeting and shows only a quiet dot
 *  trailing the pointer; dropping back under AIM_ENTER_SPD re-engages
 *  targeting with a single soft commit. The wide hysteresis band keeps
 *  the state from flapping at the boundary. */
export const AIM_ENTER_SPD = 380;
export const AIM_EXIT_SPD = 750;
/** Minimum gap between magnet ticks (sound + haptic), ms. */
export const TICK_MIN_MS = 60;

/** Pointer-speed smoothing time constant (ms) — frame-rate independent;
 *  matches the old 0.25-per-frame blend at 60 Hz. */
export const SPD_EMA_TAU_MS = 58;

/** The cursor holds the card: once a drag has truly begun, the card's
 *  center is recomputed from the live pointer every frame, so camera
 *  glides can never separate card from cursor. Centering engages after
 *  CENTER_TRAVEL_PX of cumulative pointer travel (a mere grab never
 *  moves a placed part) and eases in over CENTER_BLEND_MS. */
export const CENTER_TRAVEL_PX = 12;
export const CENTER_BLEND_MS = 140;
/** Spotlight radius while dragging, as a fraction of body height —
 *  anchor dots near the pointer brighten, distant ones stay faint. */
export const SPOT_R_FRAC = 0.13;

/** Drag-follow camera: while a drag steers over (or near) a figure, the
 *  camera eases in to a comfortable working zoom and keeps the hand in
 *  the middle of the screen, easing back to the lift-start zoom on drop.
 *
 *  The zoom pivots on the steering point (the world under the pointer
 *  holds still), and a deadzone-band pan drifts the viewport whenever
 *  the pointer strays outside the middle band — so edge-of-screen drags
 *  follow continuously (the pan runs on every drag, zoomed or not, and
 *  replaces React Flow's own edge auto-pan). Engagement is spatially
 *  hysteretic (a slim pad engages, a wider one releases — no flapping
 *  along the silhouette's edge). Zoom only deepens while the hand is
 *  aiming, so a fling across a figure never zooms in; and both glides
 *  stretch their time constants with hand speed, so the world hangs
 *  back rather than swimming under a fast pointer. */
export const FOLLOW_ENTER_PAD = 0.12; // figureUnder pad that engages the zoom
export const FOLLOW_EXIT_PAD = 0.26; // …and the wider pad that releases it
export const FOLLOW_GAP_PX = 40; // densest anchors read ≥ this far apart (px)
export const FOLLOW_MIN = 1.45; // working zoom floor
export const FOLLOW_MAX = 2.4; // …and ceiling (desktop)
export const FOLLOW_MAX_PHONE = 1.9; // small screens get a gentler ceiling
export const CENTER_BAND_FRAC = 0.2; // deadzone half-extent, fraction of canvas
export const CENTER_TAU_MS = 240; // recentering-pan time constant
/** Camera-glide time constant (ms) — frame-rate independent; matches the
 *  old 0.09-per-frame lerp at 60 Hz (no double-speed glide at 120 Hz). */
export const GLIDE_TAU_MS = 177;

/** On touch, the steering point floats this many screen px above the
 *  fingertip so the indicator is never hidden under the hand. */
export const TOUCH_STEER_OFFSET = 52;

export const MIN_SCALE = 0.6;
export const MAX_SCALE = 3.0;

/** Muted card palette — sage, clay, dusty blue, mauve, sand, slate, blush, fog. */
export const PALETTE = [
  "#DCE3D5",
  "#E8D8CC",
  "#D3DEE6",
  "#E0D6E2",
  "#EAE3D0",
  "#D5DBDE",
  "#EBDBD8",
  "#E7E5E0",
] as const;

export const ARROW_COLORS = [
  "#7D8B74",
  "#A98467",
  "#6E8898",
  "#9A7E9F",
  "#B08968",
  "#5C6B73",
  "#C08A8A",
  "#8A8578",
] as const;
