/* ════════════════════════════════════════════════════════════════════
   TUNING — every feel/layout constant in one place (data, editable)
   ════════════════════════════════════════════════════════════════════ */

/** Body coordinate space: normalized anchors (0–1) over a box of this
 *  aspect, rendered at BODY_H flow units tall × bodyScale, centered on
 *  flow origin (0,0). */
export const BODY_H = 1000;
const BODY_ASPECT = 0.46;
export const BODY_W = BODY_H * BODY_ASPECT;

/** Horizontal gap between the two figures (flow units, unscaled).
 *  Legacy from the side-by-side layout; kept for any older references. */
export const VIEW_GAP = 150;
/** Full scene width: two figures plus the gap (legacy side-by-side). */
export const SCENE_W = BODY_W * 2 + VIEW_GAP;

/** Single-body view: the shown surface sits centered at x=0; the hidden
 *  surface's parts rest in a side lane of this width on each edge, so
 *  they read as "on the other side" without leaving the frame. */
export const PARK_LANE = 210;
/** Scene width for the single centered body plus its two park lanes —
 *  drives the initial framing and the pan bounds. */
export const SINGLE_SCENE_W = BODY_W + 2 * PARK_LANE;

/** How far past the scene (and any off-body parts) the pan can still
 *  wander — generous enough that fitAll's own framing and the drag-follow
 *  camera's recentering pan never brush it, but the canvas is no longer
 *  the endless void it used to be. One body height, scaled with the body
 *  so it stays proportionate as the figures grow or shrink. */
export const EXTENT_MARGIN = BODY_H;

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
/** Minimum gap between magnet haptic ticks, ms. */
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

/** Muted card palette — sage, clay, dusty blue, mauve, sand, slate, blush,
 *  fog. Client-supplied hex set (2026-07); slot order/names preserved so
 *  positional consumers (sample-map indices, persistence `% 8` fallback)
 *  stay meaningful. */
export const PALETTE = [
  "#DCE7D1",
  "#EFD5C3",
  "#CEDEEA",
  "#E0D2E5",
  "#F1E6C9",
  "#D3DBE0",
  "#EFD7D3",
  "#E8E6DE",
] as const;

/** Human-readable names for PALETTE, in the same order — a screen reader
 *  announcing "Color #dce7d1" is meaningless; this is what the hex should
 *  actually be labeled as. Keys are the exact uppercase hex strings. */
export const PALETTE_NAMES: Record<string, string> = {
  "#DCE7D1": "sage",
  "#EFD5C3": "clay",
  "#CEDEEA": "dusty blue",
  "#E0D2E5": "mauve",
  "#F1E6C9": "sand",
  "#D3DBE0": "slate",
  "#EFD7D3": "blush",
  "#E8E6DE": "fog",
};

/** Arrows are always this near-black now (client asked for black-only
 *  arrows — the per-arrow color picker was removed). One place to tune the
 *  exact shade. Reads as black on the warm --canvas without the harshness
 *  of pure #000. Still WCAG-fine as a 2px stroke / arrowhead. */
export const ARROW_INK = "#33302C";

/** Two entries darkened slightly from their original values (#B08968 →
 *  #AA8261, #C08A8A → #B07C7C) — both fell under WCAG 1.4.11's 3:1 minimum
 *  for meaningful graphics against --canvas (2.91:1 and 2.66:1 measured).
 *  Existing saved arrows keep whichever exact color they already have
 *  (colors are stored per-arrow, not looked up by index) — this only
 *  changes what new picks look like going forward. */
export const ARROW_COLORS = [
  "#7D8B74",
  "#A98467",
  "#6E8898",
  "#9A7E9F",
  "#AA8261",
  "#5C6B73",
  "#B07C7C",
  "#8A8578",
] as const;

/** Human-readable names for ARROW_COLORS, same order/purpose as
 *  PALETTE_NAMES. */
export const ARROW_COLOR_NAMES: Record<string, string> = {
  "#7D8B74": "sage",
  "#A98467": "clay",
  "#6E8898": "slate blue",
  "#9A7E9F": "mauve",
  "#AA8261": "sand",
  "#5C6B73": "slate",
  "#B07C7C": "rose",
  "#8A8578": "moss",
};
