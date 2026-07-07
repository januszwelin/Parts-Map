"use client";

/**
 * Parts Map — a spatial canvas for IFS parts work.
 *
 * The main orchestrator: owns the single parts/arrows dataset, the
 * bespoke drag/magnet/camera choreography (rAF loops writing straight
 * to the DOM), undo history, tap-to-place, auto-space, save/load, and
 * all app-level wiring. Leaf layers live in lib/ (data + pure logic),
 * hooks/ (context + media queries), and components/ (body art, cards,
 * edges, panels, sheets) — see CLAUDE.md for the module map.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  MarkerType,
  ConnectionMode,
  useReactFlow,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type XYPosition,
  type Viewport,
} from "@xyflow/react";
import {
  BODY_H,
  BODY_W,
  SCENE_W,
  STICK_RIVAL,
  STICK_RELEASE,
  AIM_ENTER_SPD,
  AIM_EXIT_SPD,
  SPD_EMA_TAU_MS,
  CENTER_TRAVEL_PX,
  CENTER_BLEND_MS,
  FOLLOW_ENTER_PAD,
  FOLLOW_EXIT_PAD,
  FOLLOW_GAP_PX,
  FOLLOW_MIN,
  FOLLOW_MAX,
  FOLLOW_MAX_PHONE,
  CENTER_BAND_FRAC,
  CENTER_TAU_MS,
  GLIDE_TAU_MS,
  TOUCH_STEER_OFFSET,
  MIN_SCALE,
  MAX_SCALE,
  PALETTE,
  ARROW_COLORS,
} from "@/lib/tuning";
import { REGIONS, REGION_BY_KEY } from "@/lib/regions";
import {
  newId,
  type Depth,
  type Part,
  type Arrow,
  type MapDoc,
  type HandleSide,
} from "@/lib/types";
import {
  figureCenterX,
  anchorToFlow,
  offBodySuggestion,
  nearestTarget,
  MIN_ANCHOR_GAP,
  figureUnder,
  resolveMagnet,
  nearestOffZone,
  mapExtent,
  freeSpawnGrid,
  easeOutBack,
  easeInOutCubic,
  easeOutCubic,
  derivePositions,
} from "@/lib/geometry";
import {
  matchRegion,
  interpretLocations,
  parseImportText,
} from "@/lib/matcher";
import { downloadMap, loadMapFile, parseMapJson } from "@/lib/persistence";
import { createMap, updateMap, CloudError } from "@/lib/cloud";
import { authClient } from "@/lib/auth-client";
import {
  getDraftEnabled,
  setDraftEnabled,
  saveDraft,
  readDraftJson,
  clearDraft,
} from "@/lib/draft";
import { sndPlay, sndSetMuted, magnetTick } from "@/lib/sound";
import { haptic } from "@/lib/haptics";
import { getWelcomeSeen, setWelcomeSeen } from "@/lib/onboarding";
import { sampleMap } from "@/lib/sample-map";
import { partSurface, locationDisplay } from "@/lib/part-utils";
import { panelStyle } from "@/lib/ui";
import { AppApiContext, PartsListContext, type AppApi } from "@/hooks/use-app-api";
import { useIsPhone, useReducedMotion } from "@/hooks/use-media";
import {
  BodyOutline,
  AnchorConstellation,
} from "@/components/body-outline";
import { MobileEditSheet } from "@/components/part-editor";
import { PartNode } from "@/components/part-node";
import { FloatingEdge, ConnectionLine } from "@/components/floating-edge";
import {
  LiftOverlay,
  MOVING_TARGET,
  FREE_TARGET,
  type LiftTarget,
} from "@/components/lift-overlay";
import { Toolbar, FrameMapButton } from "@/components/toolbar";
import { PartsListPanel, PhonePartsSheet } from "@/components/parts-list";
import { ImportModal } from "@/components/import-modal";
import { WelcomeModal } from "@/components/welcome";
import { MyMapsModal } from "@/components/my-maps";
import { CoachMarks, TOUR_STEPS, type TourSnapshot } from "@/components/coach-marks";

/* ════════════════════════════════════════════════════════════════════
   9. MAIN APP
   ════════════════════════════════════════════════════════════════════ */

const nodeTypes = { part: PartNode };
const edgeTypes = { floating: FloatingEdge };

const sameLiftTarget = (a: LiftTarget | null, b: LiftTarget): boolean =>
  !!a &&
  (b.kind === "region"
    ? a.kind === "region" && a.key === b.key && a.depth === b.depth
    : a.kind === b.kind);

/** Per-gesture touch detection. React Flow hands us d3-drag's sourceEvent —
 *  a genuine MouseEvent or TouchEvent — so this is exact. No environment
 *  heuristics: a mouse drag on a touch-screen laptop is a mouse drag. */
const isTouchInput = (e: unknown): boolean => {
  const n = (e as { nativeEvent?: unknown } | null)?.nativeEvent ?? e;
  if (typeof TouchEvent !== "undefined" && n instanceof TouchEvent) return true;
  const t = n as { pointerType?: string; type?: string } | null;
  return t?.pointerType === "touch" || /^touch/.test(t?.type ?? "");
};

/** Screen-space pointer position from a drag event (mouse or touch).
 *  The aim gate measures hand speed here, in raw client px — never in
 *  flow space, so the drag-follow camera's own motion can't masquerade
 *  as hand motion. */
const eventClient = (e: unknown): XYPosition | null => {
  const n = (e as { nativeEvent?: unknown } | null)?.nativeEvent ?? e;
  if (typeof TouchEvent !== "undefined" && n instanceof TouchEvent) {
    const t = n.touches[0] ?? n.changedTouches[0];
    return t ? { x: t.clientX, y: t.clientY } : null;
  }
  const m = n as { clientX?: number; clientY?: number } | null;
  return typeof m?.clientX === "number" && typeof m?.clientY === "number"
    ? { x: m.clientX, y: m.clientY }
    : null;
};


function PartsMapApp() {
  const rf = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ——— the single source of truth ———
  const [parts, setParts] = useState<Part[]>([]);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [bodyScale, setBodyScale] = useState(1);
  const [autoScale, setAutoScale] = useState(true);

  // ——— view state ———
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [dragOverride, setDragOverride] = useState<{
    id: string;
    pos: XYPosition;
  } | null>(null);
  // React Flow's DOM measurements, echoed back through the controlled
  // `nodes` prop so RF considers nodes initialized (else dragging logs
  // error #015 and useNodesInitialized never turns true). Never written
  // into `parts` — p.w/p.h means "the user fixed this size" — and never
  // persisted.
  const [measuredDims, setMeasuredDims] = useState<
    ReadonlyMap<string, { w: number; h: number }>
  >(new Map());
  const [lift, setLift] = useState<{ id: string; isTouch: boolean } | null>(
    null,
  );
  const [liftTarget, setLiftTarget] = useState<LiftTarget | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  /** Tap-to-place: pressing Add births the part into a brief placement
   *  mode — a ghost card follows the hand, the anchor constellation
   *  steps forward, and one tap gives the part its home. The part is
   *  only created at the tap; cancelling hands the name back. */
  const [placing, setPlacing] = useState<{
    name: string;
    color: string;
  } | null>(null);
  /** Whether the placement gesture is touch (flips the label pill). */
  const [placingTouch, setPlacingTouch] = useState(false);
  /** The Add input's text — lives here so cancelling a placement can
   *  restore the typed name. */
  const [draft, setDraft] = useState("");
  const isPhone = useIsPhone();
  const reducedMotion = useReducedMotion();
  const isPhoneRef = useRef(false);
  useEffect(() => {
    isPhoneRef.current = isPhone;
  }, [isPhone]);
  /** Quiet notice pill: transient feedback (auto-space, saved, undo…),
   *  optionally carrying a single action such as Undo. */
  const [notice, setNotice] = useState<{
    text: string;
    key: number;
    action?: { label: string; run: () => void };
    ttlMs?: number;
  } | null>(null);
  /** Save/sync state for the toolbar indicator. "clean" = matches last
   *  save/load, "dirty" = unsaved edits, "saving"/"saved" = cloud sync. */
  const [saveStatus, setSaveStatus] = useState<
    "clean" | "dirty" | "saving" | "saved"
  >("clean");
  /** Bumped on every map mutation — the debounce key for cloud auto-save
   *  and the opt-in local draft (a plain "dirty" boolean wouldn't re-fire
   *  the debounce on the 2nd, 3rd… edit). */
  const [dirtyNonce, setDirtyNonce] = useState(0);
  /** Opt-in: mirror the map to this device's localStorage so a tab-close
   *  can't lose work. OFF by default — these maps are sensitive, so nothing
   *  is stored without explicit consent (lib/draft.ts). */
  const [draftEnabled, setDraftEnabledState] = useState(false);
  const { data: session } = authClient.useSession();

  /** Session-only sound preference (no persistence by design). */
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => {
    sndSetMuted(!soundOn);
  }, [soundOn]);

  /** One-shot landing effects: card pop (via node data) + anchor ripple. */
  const [dropPop, setDropPop] = useState<{ id: string; key: number } | null>(
    null,
  );
  const [ripple, setRipple] = useState<{
    pos: XYPosition;
    key: number;
  } | null>(null);

  // ——— refs for the imperative drag loop (zero re-renders per frame) ———
  const partsRef = useRef(parts);
  const arrowsRef = useRef(arrows);
  const bodyScaleRef = useRef(bodyScale);
  useEffect(() => {
    partsRef.current = parts;
  }, [parts]);
  useEffect(() => {
    arrowsRef.current = arrows;
  }, [arrows]);
  useEffect(() => {
    bodyScaleRef.current = bodyScale;
  }, [bodyScale]);
  const autoScaleRef = useRef(autoScale);
  useEffect(() => {
    autoScaleRef.current = autoScale;
  }, [autoScale]);

  /* ——— onboarding: a first-run welcome, and an optional guided tour ———
     The only localStorage this app touches, and only for a "have they
     seen the welcome" boolean — no map data is ever stored (lib/onboarding.ts). */
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [framedTick, setFramedTick] = useState(0);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const tourBaselineRef = useRef<TourSnapshot | null>(null);
  // Reading localStorage has to wait for the client (the initial render
  // must match the server's, which has no localStorage to read) — this
  // mount-only effect is the standard hydration-safe shape for that, not
  // state genuinely worth deriving during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!getWelcomeSeen()) setWelcomeOpen(true);
  }, []);
  const closeWelcome = useCallback(() => {
    setWelcomeOpen(false);
    setWelcomeSeen();
  }, []);
  const startTour = useCallback(() => {
    setWelcomeOpen(false);
    setWelcomeSeen();
    tourBaselineRef.current = {
      partsCount: partsRef.current.length,
      arrowsCount: arrowsRef.current.length,
      selectedId,
      listOpen,
      exportMenuOpen,
      framedTick,
    };
    setTourStep(0);
  }, [selectedId, listOpen, exportMenuOpen, framedTick]);
  const skipTour = useCallback(() => setTourStep(null), []);
  /** The "?" button — always reopens the welcome choice, even mid-tour. */
  const reopenWelcome = useCallback(() => {
    setTourStep(null);
    setWelcomeOpen(true);
  }, []);
  const tourSnapshot: TourSnapshot = useMemo(
    () => ({
      partsCount: parts.length,
      arrowsCount: arrows.length,
      selectedId,
      listOpen,
      exportMenuOpen,
      framedTick,
    }),
    [parts.length, arrows.length, selectedId, listOpen, exportMenuOpen, framedTick],
  );
  // Advance (or end) the tour when the current step's real-world action
  // has actually happened — never on a timer. A state machine over time
  // (each step's "done" reads a baseline captured when it began) isn't
  // expressible as a pure per-render derivation, so an effect is the
  // right tool here, not a lint dodge.
  useEffect(() => {
    if (tourStep === null) return;
    const baseline = tourBaselineRef.current;
    if (!baseline) return;
    if (!TOUR_STEPS[tourStep].done(tourSnapshot, baseline)) return;
    if (tourStep + 1 >= TOUR_STEPS.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTourStep(null);
      setNotice({ text: "That's the tour — this space is yours", key: Date.now() });
    } else {
      tourBaselineRef.current = tourSnapshot;
      setTourStep(tourStep + 1);
    }
  }, [tourStep, tourSnapshot]);
  /** On phone the parts list is a bottom sheet tall enough to cover the
   *  frame-map button underneath it — if satisfying the "list" step (by
   *  opening the ⋯ menu) has already advanced the tour to "frame" while
   *  the list is still open, showing that callout would point at a
   *  button the user can't even see yet. Hold it back until the list
   *  itself closes; every other step is unaffected. */
  const tourStepId = tourStep !== null ? TOUR_STEPS[tourStep].id : null;
  const tourVisible =
    tourStep !== null && !placing && !(listOpen && tourStepId !== "list");

  /* ——— undo: a bounded snapshot history of the map (parts + arrows).
         Body scale keeps its own pill Undo; viewport and selection are
         not history. In-memory only — nothing persists, by design. ——— */
  const historyRef = useRef<
    { parts: Part[]; arrows: Arrow[]; label: string; tag: string; at: number }[]
  >([]);
  /** Redo stack — the inverse of historyRef. Fed only by undo(); wiped by
   *  any fresh mutation (a new action forks the timeline) and on load. */
  const redoRef = useRef<
    { parts: Part[]; arrows: Arrow[]; label: string; tag: string; at: number }[]
  >([]);
  /** Anything worth undoing is also unsaved — the beforeunload guard
   *  reads this. Cleared on save and on load. */
  const dirtyRef = useRef(false);
  /** Reactive mirrors of historyRef/redoRef length + top label, purely so
   *  the toolbar's Undo/Redo buttons (mobile has no other way to undo —
   *  Ctrl/Cmd+Z doesn't exist on a touchscreen) can show enabled state and
   *  name what they'd do. The refs stay the source of truth; these never
   *  drive logic. */
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoLabel, setUndoLabel] = useState<string | null>(null);
  const [redoLabel, setRedoLabel] = useState<string | null>(null);
  /** Single entry point for "the map changed": flips the ref the unload
   *  guard reads, lights the toolbar indicator, and bumps the debounce
   *  nonce that drives cloud auto-save + the local draft. */
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveStatus("dirty");
    setDirtyNonce((n) => n + 1);
  }, []);
  /** Snapshot the map BEFORE a mutation. Same-tag pushes within a second
   *  coalesce (scrubbing color swatches is one undo, not eight). */
  const pushHistory = useCallback((tag: string, label: string) => {
    markDirty();
    // A fresh action forks the timeline — the redo branch is now stale.
    redoRef.current = [];
    setCanRedo(false);
    setRedoLabel(null);
    const h = historyRef.current;
    const now = Date.now();
    const top = h[h.length - 1];
    if (top && top.tag === tag && now - top.at < 1000) {
      top.at = now;
      setUndoLabel(label);
      return;
    }
    h.push({
      parts: partsRef.current,
      arrows: arrowsRef.current,
      label,
      tag,
      at: now,
    });
    if (h.length > 30) h.shift();
    setCanUndo(true);
    setUndoLabel(label);
  }, [markDirty]);

  /* One-time touch hint: the connect dots have no hover to reveal them
     on touch — name them once, the first time a card is selected. */
  const linkHintShownRef = useRef(false);
  const maybeShowLinkHint = useCallback(() => {
    if (linkHintShownRef.current) return;
    if (!(window.matchMedia?.("(pointer: coarse)").matches ?? false)) return;
    linkHintShownRef.current = true;
    setNotice({
      text: "Drag a dot on the card’s edge to link parts",
      key: Date.now(),
    });
  }, []);

  const liftInfoRef = useRef<{ id: string; isTouch: boolean } | null>(null);
  const cardPosRef = useRef<XYPosition>({ x: 0, y: 0 });
  const indPosRef = useRef<XYPosition>({ x: 0, y: 0 });
  const indVelRef = useRef<XYPosition>({ x: 0, y: 0 });
  /** Sticky magnet: the anchor currently held by the lift indicator. */
  const stickRef = useRef<{ key: string; depth: Depth } | null>(null);
  /** Aim gate: screen-space pointer speed (time-based EMA) and the
   *  aim/transit hysteresis — the magnet only retargets while aiming. */
  const aimRef = useRef({
    aiming: true,
    spdEma: 0,
    prevX: 0,
    prevY: 0,
    prevT: 0,
    lastTickAt: 0,
  });
  /** Raw client px of the dragging pointer (written by onNodeDrag). */
  const pointerScreenRef = useRef<XYPosition | null>(null);
  /** React Flow's own reported node position (grab-offset based) — only
   *  the blend source before cursor-centering completes. */
  const rfPosRef = useRef<XYPosition>({ x: 0, y: 0 });
  /** Cursor-centering state for the active drag. */
  const centerRef = useRef({
    engaged: false,
    start: 0,
    travel: 0,
    /** Last frame's (center − rfPos) x-gap, so blend-injected motion can
     *  be subtracted from the tilt physics (it isn't hand velocity). */
    prevGapX: 0,
    lastWrite: null as XYPosition | null,
    /** Whether the grab seeded an anchor landing — those parts land on
     *  their anchor regardless, so zoom-drift may engage centering with
     *  zero travel without ever moving the landing. */
    seedSnapped: false,
  });
  /** Constellation spotlight circle (cx/cy written per frame). */
  const spotRef = useRef<SVGCircleElement | null>(null);
  /** Drag-follow camera: zoom at lift start, reduced-motion opt-out,
   *  phone zoom ceiling, and the spatial near/far hysteresis latch
   *  (see the FOLLOW_ consts). */
  const followRef = useRef<{
    base: number;
    reduced: boolean;
    phone: boolean;
    near: boolean;
  } | null>(null);
  const restoreRafRef = useRef(0);
  const lastTargetRef = useRef<{ target: LiftTarget; pos: XYPosition } | null>(
    null,
  );
  const liftRafRef = useRef(0);
  const leaderRef = useRef<SVGPathElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  /** The pulse ring on the targeted anchor — written imperatively. */
  const ringRef = useRef<HTMLDivElement | null>(null);
  /** Card inner elements, for direct tilt/lag transform writes. */
  const innerElsRef = useRef(new Map<string, HTMLDivElement>());
  /** Physics state for the lifted card: filtered velocity, tilt spring,
   *  eased pickup amount. */
  const tiltRef = useRef({ vf: 0, theta: 0, thetaV: 0, liftAmt: 0, prevX: 0 });

  const settleRafRef = useRef(0);
  const settlingRef = useRef(false);
  /** Active settle tween, so a cancellation (new grab mid-settle) can
   *  restore the card's inline styles and skip its landing effects. */
  const settleStateRef = useRef<{ id: string; putDown: boolean } | null>(null);
  const scaleRafRef = useRef(0);
  const resizingRef = useRef<string | null>(null);
  const autoArmedRef = useRef(false);
  /** The scale the person last chose by hand — auto-space treats it as a
   *  floor when relaxing back, so it never undoes a deliberate setting. */
  const manualScaleRef = useRef(1);
  const colorCountRef = useRef(0);
  const placingRef = useRef<{ name: string; color: string } | null>(null);
  /** Ghost card element (screen-space) — transform written per frame. */
  const ghostRef = useRef<HTMLDivElement | null>(null);

  /* ——— initial camera: fit both figures side by side; on a phone-width
         screen that leaves two tiny figures in dead margin, so frame the
         FRONT figure comfortably instead — the Front/Back pill (and
         pinch) reach the other one. ——— */
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w < 640) {
      const zoom = Math.min(1.1, (h * 0.82) / BODY_H, (w * 0.9) / BODY_W);
      rf.setViewport({
        x: w / 2 - figureCenterX("front", 1) * zoom,
        y: h / 2,
        zoom,
      });
    } else {
      const zoom = Math.min(1.1, (h * 0.82) / BODY_H, (w * 0.92) / SCENE_W);
      rf.setViewport({ x: w / 2, y: h / 2, zoom });
    }
  }, [rf]);

  /* ——— phone Front/Back pill: which figure owns the screen center, and
         a gentle x-glide to the other one (zoom untouched — the pill
         moves the camera, it is not a mode). ——— */
  const [viewSide, setViewSide] = useState<Depth>("front");
  const glideRafRef = useRef(0);
  /** Glide the camera to a viewport with an easeOutCubic tween; reduced
   *  motion jumps straight there. One glide at a time — a new call (or a
   *  fresh grab) takes the camera over. */
  const glideViewport = useCallback(
    (to: Viewport, D = 380) => {
      cancelAnimationFrame(glideRafRef.current);
      if (
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false
      ) {
        rf.setViewport(to);
        return;
      }
      const from = rf.getViewport();
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / D);
        const e = easeOutCubic(t);
        rf.setViewport({
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e,
          zoom: from.zoom + (to.zoom - from.zoom) * e,
        });
        if (t < 1) glideRafRef.current = requestAnimationFrame(step);
      };
      glideRafRef.current = requestAnimationFrame(step);
    },
    [rf],
  );
  const onMove = useCallback((_: unknown, vp: Viewport) => {
    const el = wrapperRef.current;
    if (!el) return;
    const cx = (el.clientWidth / 2 - vp.x) / (vp.zoom || 1);
    // The figures' midline is flow x = 0 at every body scale.
    setViewSide(cx > 0 ? "back" : "front");
  }, []);
  const jumpToFigure = useCallback(
    (depth: Depth) => {
      const el = wrapperRef.current;
      if (!el) return;
      const vp = rf.getViewport();
      glideViewport({
        x:
          el.clientWidth / 2 -
          figureCenterX(depth, bodyScaleRef.current) * vp.zoom,
        y: vp.y,
        zoom: vp.zoom,
      });
    },
    [rf, glideViewport],
  );

  /** The list's "where is it?" gesture: glide the camera to a part and
   *  give its card a soft two-breath halo. */
  const [reveal, setReveal] = useState<{ id: string; key: number } | null>(
    null,
  );
  const revealPart = useCallback(
    (id: string) => {
      const el = wrapperRef.current;
      if (!el) return;
      const p = partsRef.current.find((q) => q.id === id);
      if (!p) return;
      const pos = p.offBody
        ? p.freePos
        : derivePositions(partsRef.current, bodyScaleRef.current).get(id);
      if (!pos) return;
      const vp = rf.getViewport();
      // Come no closer than a readable zoom; never zoom out to do it.
      const zoom = Math.max(vp.zoom, 0.8);
      glideViewport({
        x: el.clientWidth / 2 - pos.x * zoom,
        y: el.clientHeight / 2 - pos.y * zoom,
        zoom,
      });
      setReveal({ id, key: Date.now() });
    },
    [rf, glideViewport],
  );

  /** Frame the whole map: both figures plus any off-body strays — the
   *  app's "home"/reset view on every screen size (an optional parts
   *  array lets a just-committed import frame itself before the ref
   *  catches up). Phone used to frame the front figure alone here; that
   *  read as a dead end once the canvas gained real pan bounds (below),
   *  so it now matches desktop and the Front/Back pill remains the way
   *  to zoom into one figure. The *initial* camera effect above keeps
   *  its own front-figure framing deliberately — first open is a
   *  different moment than "take me home". */
  const fitAll = useCallback(
    (partsArr?: Part[]) => {
      const el = wrapperRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const s = bodyScaleRef.current;
      const list = partsArr ?? partsRef.current;
      // The two-figure scene (gap included) scales linearly about flow 0,0.
      let minX = (-SCENE_W * s) / 2;
      let maxX = (SCENE_W * s) / 2;
      let minY = (-BODY_H * s) / 2;
      let maxY = (BODY_H * s) / 2;
      for (const p of list) {
        if (!p.offBody) continue;
        const halfW = (p.w ?? 160) / 2 + 40;
        const halfH = (p.h ?? 48) / 2 + 40;
        minX = Math.min(minX, p.freePos.x - halfW);
        maxX = Math.max(maxX, p.freePos.x + halfW);
        minY = Math.min(minY, p.freePos.y - halfH);
        maxY = Math.max(maxY, p.freePos.y + halfH);
      }
      const zoom = Math.max(
        0.15,
        Math.min(1.1, (w * 0.92) / (maxX - minX), (h * 0.82) / (maxY - minY)),
      );
      glideViewport({
        x: w / 2 - ((minX + maxX) / 2) * zoom,
        y: h / 2 - ((minY + maxY) / 2) * zoom,
        zoom,
      });
    },
    [glideViewport],
  );

  useEffect(
    () => () => {
      cancelAnimationFrame(liftRafRef.current);
      cancelAnimationFrame(settleRafRef.current);
      cancelAnimationFrame(scaleRafRef.current);
      cancelAnimationFrame(restoreRafRef.current);
      cancelAnimationFrame(glideRafRef.current);
    },
    [],
  );

  /* ——— drop settle: rAF tween of the override (real position updates so
         edges reroute live through every frame). Optionally drives the
         card's put-down (lift/tilt relaxing to rest over the glide) and
         fires the one-shot landing effects at touchdown — never at
         release. ——— */
  const cancelSettle = useCallback(() => {
    cancelAnimationFrame(settleRafRef.current);
    const s = settleStateRef.current;
    settleStateRef.current = null;
    if (s && settlingRef.current) {
      if (s.putDown) {
        // The tween owned the inline transform; hand it back cleanly so
        // the interrupted card can't freeze mid-deformation.
        const el = innerElsRef.current.get(s.id);
        if (el) {
          el.style.transform = "";
          el.style.transition = "";
        }
      }
      settlingRef.current = false;
      setDragOverride(null);
    }
  }, []);

  /** Put the map back the way it was before the last change. Selection
   *  clears (the change being undone may have been the selected thing);
   *  auto-space stays disarmed so the restored layout isn't re-judged. */
  const undo = useCallback(() => {
    const snap = historyRef.current.pop();
    if (!snap) return;
    // Bank the current (post-action) state so redo can return to it.
    redoRef.current.push({
      parts: partsRef.current,
      arrows: arrowsRef.current,
      label: snap.label,
      tag: snap.tag,
      at: Date.now(),
    });
    if (redoRef.current.length > 30) redoRef.current.shift();
    cancelSettle();
    setDragOverride(null);
    setParts(snap.parts);
    setArrows(snap.arrows);
    setSelectedId(null);
    setSelectedEdgeId(null);
    autoArmedRef.current = false;
    setNotice({ text: `Undid — ${snap.label}`, key: Date.now() });
    setCanUndo(historyRef.current.length > 0);
    setUndoLabel(historyRef.current[historyRef.current.length - 1]?.label ?? null);
    setCanRedo(true);
    setRedoLabel(snap.label);
  }, [cancelSettle]);

  /** Re-apply the last undone change. Symmetric with undo: banks the current
   *  (pre-redo) state onto history so the redo can itself be undone. */
  const redo = useCallback(() => {
    const snap = redoRef.current.pop();
    if (!snap) return;
    historyRef.current.push({
      parts: partsRef.current,
      arrows: arrowsRef.current,
      label: snap.label,
      tag: snap.tag,
      at: Date.now(),
    });
    if (historyRef.current.length > 30) historyRef.current.shift();
    cancelSettle();
    setDragOverride(null);
    setParts(snap.parts);
    setArrows(snap.arrows);
    setSelectedId(null);
    setSelectedEdgeId(null);
    autoArmedRef.current = false;
    markDirty();
    setNotice({ text: `Redid — ${snap.label}`, key: Date.now() });
    setCanRedo(redoRef.current.length > 0);
    setRedoLabel(redoRef.current[redoRef.current.length - 1]?.label ?? null);
    setCanUndo(true);
    setUndoLabel(snap.label);
  }, [cancelSettle, markDirty]);

  const settleTween = useCallback(
    (
      id: string,
      from: XYPosition,
      to: XYPosition,
      opts?: {
        /** Lift/tilt state at release — relaxed to rest over the glide. */
        putDown?: { lag: number; theta: number; liftAmt: number };
        /** Landing effects (pop, ripple, sound, haptic) — touchdown only. */
        onLand?: () => void;
      },
    ) => {
      cancelSettle();
      if (
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false
      ) {
        // Land instantly at the anchor — no glide, no put-down relax —
        // but the touchdown effects (pop, ripple, sound, haptic) still
        // fire, same as they would at the end of a normal glide.
        const el = innerElsRef.current.get(id);
        if (el) {
          el.style.transform = "";
          el.style.transition = "";
        }
        setDragOverride(null);
        opts?.onLand?.();
        return;
      }
      settlingRef.current = true;
      settleStateRef.current = { id, putDown: !!opts?.putDown };
      const start = performance.now();
      // A drop can now glide from anywhere on the figure to its anchor —
      // stretch the duration mildly with distance so long glides don't
      // read as a yank (220ms nearby, easing up to 320ms).
      const D = Math.min(
        320,
        220 + Math.hypot(to.x - from.x, to.y - from.y) * 0.3,
      );
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / D);
        const e = easeOutBack(t);
        setDragOverride({
          id,
          pos: {
            x: from.x + (to.x - from.x) * e,
            y: from.y + (to.y - from.y) * e,
          },
        });
        const pd = opts?.putDown;
        if (pd) {
          // easeOutCubic, not easeOutBack: the pose must not overshoot
          // past rest, or the pop keyframe's scale(1) start would jump.
          const el = innerElsRef.current.get(id);
          if (el) {
            const r = 1 - easeOutCubic(t);
            const la = pd.liftAmt * r;
            el.style.transform = `translate(${pd.lag * r}px, ${-6 * la}px) scale(${
              1 + 0.03 * la
            }) rotate(${pd.theta * r}deg)`;
          }
        }
        if (t < 1) {
          settleRafRef.current = requestAnimationFrame(step);
        } else {
          if (pd) {
            const el = innerElsRef.current.get(id);
            if (el) {
              el.style.transform = "";
              el.style.transition = "";
            }
          }
          settlingRef.current = false;
          settleStateRef.current = null;
          setDragOverride(null);
          opts?.onLand?.();
        }
      };
      settleRafRef.current = requestAnimationFrame(step);
    },
    [cancelSettle],
  );

  /* ——— auto-scaling: gentle rAF tween of the body scale.
         On phone layouts the camera rides along: the figure under the
         screen center keeps its screen position AND its on-screen size
         (zoom compensates 1/scale), so making room reads as the cards
         gently spreading — the body never outgrows a small screen. On
         desktop the scene simply grows about its center, as before. ——— */
  const animateBodyScale = useCallback(
    (target: number) => {
      cancelAnimationFrame(scaleRafRef.current);
      const from = bodyScaleRef.current;
      const to = Math.min(MAX_SCALE, Math.max(MIN_SCALE, target));
      if (Math.abs(to - from) < 0.005) return;
      markDirty();
      const el = wrapperRef.current;
      const phone = !!el && el.clientWidth < 640;
      const vp0 = rf.getViewport();
      const z0 = vp0.zoom || 1;
      const w = el?.clientWidth ?? 0;
      const side: Depth = (w / 2 - vp0.x) / z0 > 0 ? "back" : "front";
      // Screen x the framed figure's center must hold through the tween.
      const sx = figureCenterX(side, from) * z0 + vp0.x;
      if (
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false
      ) {
        setBodyScale(to);
        if (phone) {
          const z = z0 * (from / to);
          rf.setViewport({
            x: sx - figureCenterX(side, to) * z,
            y: vp0.y,
            zoom: z,
          });
        }
        return;
      }
      const start = performance.now();
      const D = 650;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / D);
        const s = from + (to - from) * easeInOutCubic(t);
        setBodyScale(s);
        if (phone) {
          const z = z0 * (from / s);
          rf.setViewport({
            x: sx - figureCenterX(side, s) * z,
            // Figures are vertically centered on flow y = 0, which sits
            // at screen y = vp.y at every zoom — hold it.
            y: vp0.y,
            zoom: z,
          });
        }
        if (t < 1) scaleRafRef.current = requestAnimationFrame(step);
      };
      scaleRafRef.current = requestAnimationFrame(step);
    },
    [rf, markDirty],
  );

  /* ——— the lift rAF loop: steering, sticky magnet, drag-follow camera ——— */
  const startLiftLoop = useCallback(() => {
    cancelAnimationFrame(liftRafRef.current);
    // Checked once per drag, not per frame — this doesn't change mid-gesture.
    // Only gates the decorative tilt/lag/squash physics below; the actual
    // cursor-follow positioning (functional, not decorative) is unaffected.
    const noTiltPhysics =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
      false;
    const loop = () => {
      const info = liftInfoRef.current;
      if (!info) return;
      // React Flow aborts a drag without onNodeDragStop when the node is
      // deleted mid-drag — never leave the loop running headless.
      if (!partsRef.current.some((p) => p.id === info.id)) {
        liftInfoRef.current = null;
        setLift(null);
        setLiftTarget(null);
        setDragOverride(null);
        return;
      }
      const scale = bodyScaleRef.current;
      const vp = rf.getViewport();
      const zoom = vp.zoom || 1;
      // ——— aim gate: hand speed in raw screen px/s, time-based EMA —
      //     frame-rate independent, and immune to the assist zoom's own
      //     glide (flow-space deltas would read camera motion as hand
      //     motion). A fast hand is in transit: the magnet holds its
      //     tongue until the hand slows back into aiming. ———
      const aim = aimRef.current;
      const nowT = performance.now();
      const dt = Math.max(1, nowT - aim.prevT);
      aim.prevT = nowT;
      const ps = pointerScreenRef.current;
      const ctr = centerRef.current;
      if (ps) {
        const dpx = Math.hypot(ps.x - aim.prevX, ps.y - aim.prevY);
        ctr.travel += dpx;
        const spd = (dpx * 1000) / dt;
        aim.prevX = ps.x;
        aim.prevY = ps.y;
        aim.spdEma +=
          (spd - aim.spdEma) * (1 - Math.exp(-dt / SPD_EMA_TAU_MS));
      }

      // ——— the cursor holds the card: recompute the card center from
      //     the live pointer each frame, so no camera glide can ever
      //     separate them. Engages after a little true travel (a grab
      //     is not a re-aim) — or immediately once the assist zoom has
      //     drifted, for anchored parts only (they land on their anchor
      //     regardless, so zero-travel centering can't scoot a fine
      //     placement). ———
      const rp = rfPosRef.current;
      let center = rp;
      if (ps) {
        if (
          !ctr.engaged &&
          (ctr.travel > CENTER_TRAVEL_PX ||
            (ctr.seedSnapped &&
              Math.abs(zoom - (followRef.current?.base ?? zoom)) > 0.02))
        ) {
          ctr.engaged = true;
          ctr.start = nowT;
        }
        if (ctr.engaged) {
          const hand = rf.screenToFlowPosition({ x: ps.x, y: ps.y });
          const e = easeOutCubic(
            Math.min(1, (nowT - ctr.start) / CENTER_BLEND_MS),
          );
          center = {
            x: rp.x + (hand.x - rp.x) * e,
            y: rp.y + (hand.y - rp.y) * e,
          };
        }
      }
      // Blend-injected motion isn't hand velocity — keep it out of the
      // tilt physics or the centering engage reads as a rotation glitch.
      const gapX = center.x - rp.x;
      tiltRef.current.prevX += gapX - ctr.prevGapX;
      ctr.prevGapX = gapX;
      cardPosRef.current = center;
      // Publish the corrected position (screen-space change threshold —
      // a calm frame writes nothing).
      const lw = ctr.lastWrite;
      if (!lw || Math.hypot(center.x - lw.x, center.y - lw.y) > 0.25 / zoom) {
        ctr.lastWrite = { x: center.x, y: center.y };
        setDragOverride({ id: info.id, pos: { x: center.x, y: center.y } });
      }

      const card = center;
      // On touch the person steers a point above the fingertip so the
      // indicator is never hidden under the hand.
      const steer = info.isTouch
        ? { x: card.x, y: card.y - TOUCH_STEER_OFFSET / zoom }
        : card;

      const wasAiming = aim.aiming;
      if (aim.aiming) {
        if (aim.spdEma > AIM_EXIT_SPD) aim.aiming = false;
      } else if (aim.spdEma < AIM_ENTER_SPD) {
        aim.aiming = true;
      }
      if (!aim.aiming) stickRef.current = null;

      // Nearest anchor across both figures; over a figure but outside
      // every capture radius, stay magnetic to that figure's anchors.
      // This resolution runs every frame — transit or aim — so a release
      // always lands on the truth under the hand.
      const res = resolveMagnet(steer, scale);
      let near = res.near;
      let hit = res.hit;
      const snapR = res.snapR;
      // The touch offset can push the steer point past the extremities
      // (crown, feet); if it misses but the card itself is on a figure,
      // target from the card instead of falling into off-body mode.
      if (!hit && info.isTouch) {
        const fig = figureUnder(card, scale);
        const nc = nearestTarget(card, scale, fig ?? undefined);
        if (nc && (nc.dist < snapR || fig)) {
          near = nc;
          hit = true;
        }
      }

      // Sticky grip (aiming only): hold the current anchor until a rival
      // is decisively closer or the pointer has clearly left its cell —
      // the target never flickers along the midline between two anchors.
      const stick = stickRef.current;
      if (aim.aiming && hit && near && stick) {
        const same =
          stick.key === near.region.key && stick.depth === near.depth;
        if (!same) {
          const sr = REGION_BY_KEY[stick.key];
          const sa = anchorToFlow(sr, stick.depth, scale);
          const sd = Math.hypot(steer.x - sa.x, steer.y - sa.y);
          if (sd < snapR * STICK_RELEASE && near.dist > sd * STICK_RIVAL) {
            near = { region: sr, depth: stick.depth, dist: sd };
          } else {
            magnetTick(aim, 4); // the grip hands over — a soft tick
          }
        }
      }

      let target: LiftTarget;
      let tpos: XYPosition;
      let landing: XYPosition;
      if (near && hit) {
        // The magnet owns the landing: the drop always lands on the
        // targeted anchor — the pulse ring on it says so while aiming.
        tpos = anchorToFlow(near.region, near.depth, scale);
        target = { kind: "region", key: near.region.key, depth: near.depth };
        landing = tpos;
        if (aim.aiming) {
          stickRef.current = { key: near.region.key, depth: near.depth };
        }
      } else {
        stickRef.current = null;
        target = FREE_TARGET;
        tpos = steer;
        landing = steer;
      }
      lastTargetRef.current = { target, pos: landing };
      // Slowing back down over a region commits it — one soft tick.
      if (aim.aiming && !wasAiming && target.kind === "region") {
        magnetTick(aim, 3);
      }
      // Transit shows only a quiet dot trailing the hand; aiming shows
      // the resolved target. Discrete changes only — the singletons
      // compare by reference, so no re-renders while the kind holds.
      const shown = aim.aiming ? target : MOVING_TARGET;
      setLiftTarget((prev) => (sameLiftTarget(prev, shown) ? prev : shown));

      // ——— drag-follow camera: over (or near) a figure the camera eases
      //     in to the working zoom, pivoting on the steering point so
      //     the world under the pointer holds still; and on EVERY drag a
      //     deadzone-band pan drifts the viewport whenever the pointer
      //     strays from the middle of the canvas, so edge-of-screen
      //     drags follow continuously. Both glides stretch with hand
      //     speed — a fast hand makes the camera hang back. ———
      const follow = followRef.current;
      const wrapEl = wrapperRef.current;
      if (follow && !follow.reduced && ps && wrapEl) {
        // Spatial hysteresis: a slim pad engages, a wider one releases —
        // no flapping while skirting the silhouette's edge.
        follow.near =
          figureUnder(
            steer,
            scale,
            follow.near ? FOLLOW_EXIT_PAD : FOLLOW_ENTER_PAD,
          ) !== null;
        const followZoom = Math.min(
          Math.max(FOLLOW_GAP_PX / (MIN_ANCHOR_GAP * scale), FOLLOW_MIN),
          follow.phone ? FOLLOW_MAX_PHONE : FOLLOW_MAX,
        );
        // Never zoom below wherever the person already was.
        const wantZ = follow.near
          ? Math.max(follow.base, followZoom)
          : follow.base;
        const lag = 1 + Math.min(2, aim.spdEma / 500);
        // Zoom only deepens while aiming (a fling across a figure never
        // zooms in); easing back out is allowed at any speed.
        let z = zoom;
        if (wantZ < zoom || aim.aiming) {
          z = zoom + (wantZ - zoom) * (1 - Math.exp(-dt / (GLIDE_TAU_MS * lag)));
        }
        // Compose one viewport write: zoom about the steer point, then
        // the recentering pan easing the steer point back toward the
        // middle band (never yanked to dead center).
        const sxScr = steer.x * zoom + vp.x;
        const syScr = steer.y * zoom + vp.y;
        let nx = sxScr - steer.x * z;
        let ny = syScr - steer.y * z;
        const cw = wrapEl.clientWidth;
        const chh = wrapEl.clientHeight;
        const bandX = cw * CENTER_BAND_FRAC;
        const bandY = chh * CENTER_BAND_FRAC;
        const errX =
          sxScr - Math.min(Math.max(sxScr, cw / 2 - bandX), cw / 2 + bandX);
        const errY =
          syScr - Math.min(Math.max(syScr, chh / 2 - bandY), chh / 2 + bandY);
        const k = 1 - Math.exp(-dt / (CENTER_TAU_MS * lag));
        nx -= errX * k;
        ny -= errY * k;
        if (
          Math.abs(z - zoom) > 0.0004 ||
          Math.abs(nx - vp.x) > 0.01 ||
          Math.abs(ny - vp.y) > 0.01
        ) {
          rf.setViewport({ x: nx, y: ny, zoom: z });
          // A camera move under a stationary pointer shifts the card's
          // flow position — that isn't hand motion, so keep it out of
          // the tilt physics (same treatment as the centering blend).
          tiltRef.current.prevX += (sxScr - nx) / z - steer.x;
        }
      }

      // Firm, near-critically-damped spring — the landing preview: locked
      // targets pull the dot onto the anchor; free-form placement keeps
      // it under the hand; in transit it trails, claiming nothing.
      const springTo = aim.aiming ? landing : steer;
      const p = indPosRef.current;
      const v = indVelRef.current;
      v.x += (springTo.x - p.x) * 0.28;
      v.y += (springTo.y - p.y) * 0.28;
      v.x *= 0.68;
      v.y *= 0.68;
      p.x += v.x;
      p.y += v.y;

      if (leaderRef.current) {
        const len = Math.hypot(p.x - card.x, p.y - card.y);
        const sag = Math.min(26, len * 0.12);
        leaderRef.current.setAttribute(
          "d",
          `M ${card.x} ${card.y} Q ${(card.x + p.x) / 2} ${
            (card.y + p.y) / 2 + sag
          } ${p.x} ${p.y}`,
        );
        // The line speaks softly while the hand is just travelling.
        leaderRef.current.setAttribute(
          "opacity",
          aim.aiming ? "0.55" : "0.35",
        );
      }
      if (indicatorRef.current) {
        indicatorRef.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
      }
      if (ringRef.current) {
        // The pulse: the anchor the drop will land on breathes softly
        // while the hand is aiming; nothing pulses in transit or off-body.
        const showRing = aim.aiming && target.kind === "region";
        ringRef.current.style.opacity = showRing ? "1" : "0";
        ringRef.current.style.transform = `translate(${tpos.x}px, ${tpos.y}px)`;
      }
      if (spotRef.current) {
        spotRef.current.setAttribute("cx", String(steer.x));
        spotRef.current.setAttribute("cy", String(steer.y));
      }

      // ——— card physics: velocity tilt, trailing lag, eased pickup ———
      const el = innerElsRef.current.get(info.id);
      if (el) {
        const tl = tiltRef.current;
        const dxFlow = card.x - tl.prevX;
        tl.prevX = card.x;
        tl.vf += (dxFlow - tl.vf) * 0.25; // velocity low-pass (~60ms)
        const thetaT = Math.max(-4, Math.min(4, tl.vf * zoom * 0.35));
        tl.thetaV += (thetaT - tl.theta) * 0.18;
        tl.thetaV *= 0.75; // slight overshoot when the drag stops
        tl.theta += tl.thetaV;
        tl.liftAmt += (1 - tl.liftAmt) * 0.22; // pickup eases in, no snap
        // The state above keeps updating regardless (settleTween's putDown
        // pose reads tl.theta/liftAmt at release, and other code corrects
        // tl.prevX for camera-induced shift) — only the visual application
        // is skipped, so a lifted card doesn't tilt/lag/squash for someone
        // who's asked for reduced motion.
        if (noTiltPhysics) {
          el.style.transform = "";
        } else {
          const lag = Math.max(-6, Math.min(6, -tl.vf * 0.3));
          el.style.transform = `translate(${lag}px, ${-6 * tl.liftAmt}px) scale(${
            1 + 0.03 * tl.liftAmt
          }) rotate(${tl.theta}deg)`;
        }
      }

      liftRafRef.current = requestAnimationFrame(loop);
    };
    liftRafRef.current = requestAnimationFrame(loop);
  }, [rf]);

  const onNodeDragStart = useCallback(
    (e: MouseEvent | TouchEvent, node: Node) => {
      cancelSettle();
      // Own the override from frame one — a regrab mid-settle must not
      // flash at the derived position while the loop spins up.
      setDragOverride({ id: node.id, pos: { ...node.position } });
      cancelAnimationFrame(restoreRafRef.current);
      cancelAnimationFrame(glideRafRef.current);
      const isTouch = isTouchInput(e);
      const session = { id: node.id, isTouch };
      liftInfoRef.current = session;
      cardPosRef.current = { ...node.position };
      rfPosRef.current = { ...node.position };
      centerRef.current = {
        engaged: false,
        start: 0,
        travel: 0,
        prevGapX: 0,
        lastWrite: { ...node.position },
        seedSnapped: false,
      };
      indPosRef.current = { ...node.position };
      indVelRef.current = { x: 0, y: 0 };
      stickRef.current = null;
      // React Flow aborts drags (pinch second-touch, deletion) without
      // firing onNodeDragStop — if the lift state survives the pointer
      // going up, tear it down rather than looping headless.
      const relief = () => {
        window.removeEventListener("pointerup", relief, true);
        window.removeEventListener("touchend", relief, true);
        window.removeEventListener("touchcancel", relief, true);
        setTimeout(() => {
          // Compare the session object, not the id — a fresh regrab of
          // the same card within the delay must not be torn down.
          if (liftInfoRef.current === session) {
            cancelAnimationFrame(liftRafRef.current);
            liftInfoRef.current = null;
            setLift(null);
            setLiftTarget(null);
            setDragOverride(null);
            const el = innerElsRef.current.get(node.id);
            if (el) {
              el.style.transition = "";
              el.style.transform = "";
            }
          }
        }, 400);
      };
      window.addEventListener("pointerup", relief, true);
      window.addEventListener("touchend", relief, true);
      window.addEventListener("touchcancel", relief, true);
      const client = eventClient(e);
      pointerScreenRef.current = client;
      aimRef.current = {
        // Seed aiming: spdEma starts at 0, so starting in transit would
        // fire a spurious commit tick on the very first frame.
        aiming: true,
        spdEma: 0,
        prevX: client?.x ?? 0,
        prevY: client?.y ?? 0,
        prevT: performance.now(),
        lastTickAt: 0,
      };
      followRef.current = {
        base: rf.getViewport().zoom || 1,
        reduced:
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
          false,
        phone: isPhoneRef.current,
        near: false,
      };
      // Seed the landing truth synchronously: a flick released before
      // the first rAF frame must still land where it was dropped, not
      // silently demote to off-body. A grab is NOT a re-aim: an on-body
      // part seeds its OWN region, so a mere flick can never relabel it
      // toward a neighboring anchor.
      {
        const scale = bodyScaleRef.current;
        const part = partsRef.current.find((p) => p.id === node.id);
        const ownRegion =
          part && !part.offBody ? REGION_BY_KEY[part.location] : undefined;
        if (part && ownRegion && !ownRegion.offBody) {
          const surface = partSurface(part);
          centerRef.current.seedSnapped = true;
          lastTargetRef.current = {
            target: { kind: "region", key: part.location, depth: surface },
            pos: { ...node.position },
          };
        } else {
          const { near, hit } = resolveMagnet(node.position, scale);
          if (hit && near) {
            const a = anchorToFlow(near.region, near.depth, scale);
            centerRef.current.seedSnapped = true;
            lastTargetRef.current = {
              target: { kind: "region", key: near.region.key, depth: near.depth },
              pos: a,
            };
          } else {
            lastTargetRef.current = {
              target: FREE_TARGET,
              pos: { ...node.position },
            };
          }
        }
      }
      // Park the spotlight under the hand before the constellation
      // fades in, so it can't reveal the previous drag's position.
      spotRef.current?.setAttribute("cx", String(node.position.x));
      spotRef.current?.setAttribute("cy", String(node.position.y));
      tiltRef.current = {
        vf: 0,
        theta: 0,
        thetaV: 0,
        liftAmt: 0,
        prevX: node.position.x,
      };
      // Suspend the CSS transform transition while the loop owns the
      // transform (keep the shadow ease); restored on drop.
      const inner = innerElsRef.current.get(node.id);
      if (inner) {
        inner.style.transition =
          "box-shadow 180ms cubic-bezier(0.33, 1, 0.68, 1)";
      }
      sndPlay("lift");
      haptic(6);
      setLift({ id: node.id, isTouch });
      setSelectedEdgeId(null);
      startLiftLoop();
    },
    [rf, startLiftLoop, cancelSettle],
  );

  const onNodeDrag = useCallback((e: MouseEvent | TouchEvent, node: Node) => {
    // The loop owns cardPosRef (cursor-centering) — RF's grab-offset
    // position is only the blend source until centering completes.
    rfPosRef.current = node.position;
    const client = eventClient(e);
    if (client) pointerScreenRef.current = client;
  }, []);

  const onNodeDragStop = useCallback(
    () => {
      cancelAnimationFrame(liftRafRef.current);
      const info = liftInfoRef.current;
      liftInfoRef.current = null;
      const last = lastTargetRef.current;
      setLift(null);
      setLiftTarget(null);
      if (!info) return;
      // The pose at release — the settle tween relaxes it to rest over
      // the glide (the put-down), so the card is never yanked upright.
      const tl = tiltRef.current;
      const putDown = {
        lag: Math.max(-6, Math.min(6, -tl.vf * 0.3)),
        theta: tl.theta,
        liftAmt: tl.liftAmt,
      };
      // The loop-corrected center (cursor-held), not RF's grab-offset
      // position — the card lands exactly where the person sees it.
      const dropPos = { ...cardPosRef.current };
      // The follow camera hands back: ease to the lift-start zoom,
      // pivoting on the drop point so the landed card doesn't jump.
      const follow = followRef.current;
      followRef.current = null;
      if (follow && !follow.reduced) {
        const vp = rf.getViewport();
        if (Math.abs(vp.zoom - follow.base) > 0.01) {
          cancelAnimationFrame(restoreRafRef.current);
          const fromZ = vp.zoom;
          const toZ = follow.base;
          const sx = dropPos.x * fromZ + vp.x;
          const sy = dropPos.y * fromZ + vp.y;
          const start = performance.now();
          const D = 360;
          const step = (now: number) => {
            const t = Math.min(1, (now - start) / D);
            const z = fromZ + (toZ - fromZ) * easeOutCubic(t);
            rf.setViewport({
              x: sx - dropPos.x * z,
              y: sy - dropPos.y * z,
              zoom: z,
            });
            if (t < 1) restoreRafRef.current = requestAnimationFrame(step);
          };
          restoreRafRef.current = requestAnimationFrame(step);
        }
      }
      if (!last || last.target.kind !== "region") {
        // Off-body: the card stays exactly where it was dropped. Hand
        // the transform straight back to CSS — the restored 180ms
        // transition relaxes the tilt/lift in place.
        const inner = innerElsRef.current.get(info.id);
        if (inner) {
          inner.style.transition = "";
          inner.style.transform = "";
        }
        const zone = nearestOffZone(dropPos, bodyScaleRef.current);
        pushHistory(`move:${info.id}`, "move");
        setParts((ps) =>
          ps.map((p) =>
            p.id === info.id
              ? {
                  ...p,
                  offBody: true,
                  freePos: dropPos,
                  location: zone,
                  depth: "front",
                }
              : p,
          ),
        );
        setDragOverride(null);
        sndPlay("free");
        haptic(6);
      } else {
        // On-body: the drop always lands on the targeted anchor — the
        // pulsing point the aim promised. Landing effects fire at
        // touchdown, never at release.
        const { key, depth } = last.target;
        pushHistory(`move:${info.id}`, "move");
        const updated = partsRef.current.map((p) =>
          p.id === info.id
            ? { ...p, offBody: false, location: key, depth }
            : p,
        );
        setParts(updated);
        const to = derivePositions(updated, bodyScaleRef.current).get(info.id);
        if (to) {
          settleTween(info.id, dropPos, to, {
            putDown,
            onLand: () => {
              const now = Date.now();
              setDropPop({ id: info.id, key: now });
              setRipple({ pos: to, key: now });
              sndPlay("drop");
              haptic(8);
            },
          });
        } else {
          const inner = innerElsRef.current.get(info.id);
          if (inner) {
            inner.style.transition = "";
            inner.style.transform = "";
          }
          setDragOverride(null);
        }
      }
      autoArmedRef.current = true;
    },
    [rf, settleTween, pushHistory],
  );

  /* The ripple element removes itself once its animation has played. */
  useEffect(() => {
    if (!ripple) return;
    const t = setTimeout(() => setRipple(null), 620);
    return () => clearTimeout(t);
  }, [ripple]);

  /* ——— controlled React Flow: apply changes back onto our state ——— */
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Resize dimension changes first, so their companion position changes
    // in the same batch are recognized as part of an active resize.
    const dims: { id: string; w: number; h: number }[] = [];
    const removed: string[] = [];
    for (const ch of changes) {
      if (ch.type === "dimensions" && ch.dimensions) {
        // Every measurement — resize or RF's initial DOM measure — is
        // remembered and echoed back via the nodes memo (see measuredDims).
        dims.push({ id: ch.id, w: ch.dimensions.width, h: ch.dimensions.height });
        if (ch.resizing) {
          resizingRef.current = ch.id;
          const dim = ch.dimensions;
          setParts((ps) =>
            ps.map((p) =>
              p.id === ch.id ? { ...p, w: dim.width, h: dim.height } : p,
            ),
          );
        }
      }
    }
    for (const ch of changes) {
      if (ch.type === "position" && ch.position) {
        if (liftInfoRef.current?.id === ch.id) {
          // The lift loop owns the dragged card's override — the cursor
          // holds the card by its center, recomputed from the live
          // pointer; RF's grab-offset position would fight it.
        } else if (ch.dragging || resizingRef.current === ch.id) {
          setDragOverride({ id: ch.id, pos: ch.position });
        } else {
          // Not a pointer drag or resize: this is React Flow's own default
          // keyboard behavior (arrow keys nudge a focused, selected node).
          // It used to be silently discarded here — the card visibly moved
          // but nothing persisted, so it snapped back on the next
          // unrelated re-render. Commit it exactly like a drop would:
          // magnet-resolve the landing point the same way onNodeDragStop
          // does, so an on-body part still only ever sits on a named
          // anchor (consistent with the text-authoritative location model
          // — this can mean a nudge jumps between anchors rather than
          // creeping pixel by pixel, which matches how dragging already
          // behaves) and an off-body part moves freely.
          const pos = ch.position;
          const scale = bodyScaleRef.current;
          const { near, hit } = resolveMagnet(pos, scale);
          pushHistory(`move:${ch.id}`, "move");
          setParts((ps) =>
            ps.map((p) =>
              p.id === ch.id
                ? hit && near
                  ? { ...p, offBody: false, location: near.region.key, depth: near.depth }
                  : {
                      ...p,
                      offBody: true,
                      freePos: pos,
                      location: nearestOffZone(pos, scale),
                      depth: "front",
                    }
                : p,
            ),
          );
        }
      } else if (ch.type === "select") {
        setSelectedId((prev) =>
          ch.selected ? ch.id : prev === ch.id ? null : prev,
        );
        if (ch.selected) {
          maybeShowLinkHint();
          // One sheet at a time on phones: selecting a card summons the
          // edit sheet, so the list sheet steps aside first.
          if (isPhoneRef.current) setListOpen(false);
        }
      } else if (ch.type === "remove") {
        const nm = partsRef.current.find((p) => p.id === ch.id)?.name;
        pushHistory(`delete:${ch.id}`, nm ? `deleted “${nm}”` : "delete");
        setParts((ps) => ps.filter((p) => p.id !== ch.id));
        setArrows((as) =>
          as.filter((a) => a.sourceId !== ch.id && a.targetId !== ch.id),
        );
        removed.push(ch.id);
        autoArmedRef.current = true;
      }
    }
    if (dims.length || removed.length) {
      setMeasuredDims((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const d of dims) {
          const cur = next.get(d.id);
          if (!cur || cur.w !== d.w || cur.h !== d.h) {
            next.set(d.id, { w: d.w, h: d.h });
            changed = true;
          }
        }
        for (const id of removed) {
          if (next.delete(id)) changed = true;
        }
        return changed ? next : prev;
      });
    }
  }, [pushHistory, maybeShowLinkHint]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const ch of changes) {
      if (ch.type === "select") {
        setSelectedEdgeId((prev) =>
          ch.selected ? ch.id : prev === ch.id ? null : prev,
        );
        // The arrow editor lives at canvas level — don't leave it buried
        // under the phone list sheet.
        if (ch.selected && isPhoneRef.current) setListOpen(false);
      } else if (ch.type === "remove") {
        pushHistory(`arrow-delete:${ch.id}`, "arrow removed");
        setArrows((as) => as.filter((a) => a.id !== ch.id));
      }
    }
  }, [pushHistory]);

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      pushHistory("arrow-add", "arrow");
      setArrows((as) => [
        ...as,
        {
          id: newId("arrow"),
          sourceId: conn.source,
          targetId: conn.target,
          color: ARROW_COLORS[0],
          // The specific dot dragged from, so the edge can exit from that
          // fixed side instead of recomputing one from geometry alone (see
          // FloatingEdge). The target has no equivalent — see the Arrow
          // type's comment.
          sourceHandle: conn.sourceHandle as HandleSide | undefined,
        },
      ]);
    },
    [pushHistory],
  );

  /* ——— the app API handed to nodes / edges / panels ——— */
  const api = useMemo<AppApi>(
    () => ({
      updatePart: (id, patch) => {
        const keys = Object.keys(patch);
        pushHistory(
          `edit:${id}:${keys.join(",")}`,
          keys.includes("name")
            ? "rename"
            : keys.includes("note")
              ? "note edit"
              : "style edit",
        );
        setParts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      },
      deletePart: (id) => {
        const nm = partsRef.current.find((p) => p.id === id)?.name;
        pushHistory(`delete:${id}`, nm ? `deleted “${nm}”` : "delete");
        setParts((ps) => ps.filter((p) => p.id !== id));
        setArrows((as) =>
          as.filter((a) => a.sourceId !== id && a.targetId !== id),
        );
        setSelectedId((prev) => (prev === id ? null : prev));
        // Removals free up room — let auto-space ease the body back.
        autoArmedRef.current = true;
      },
      setLocationText: (id, text) => {
        const m = matchRegion(text);
        if (!m) return false;
        pushHistory(`move:${id}`, "move");
        const region = REGION_BY_KEY[m.key];
        const scale = bodyScaleRef.current;
        if (region.offBody) {
          setParts((ps) =>
            ps.map((p) =>
              p.id === id
                ? {
                    ...p,
                    offBody: true,
                    location: m.key,
                    depth: "front",
                    freePos: offBodySuggestion(region, scale),
                  }
                : p,
            ),
          );
          autoArmedRef.current = true;
          return true;
        }
        // Text is authoritative: the edit moves the part exactly onto
        // the region's anchor.
        const updated = partsRef.current.map((p) =>
          p.id === id
            ? { ...p, offBody: false, location: m.key, depth: m.depth }
            : p,
        );
        const from = derivePositions(partsRef.current, scale).get(id);
        const to = derivePositions(updated, scale).get(id);
        setParts(updated);
        if (from && to && (from.x !== to.x || from.y !== to.y)) {
          settleTween(id, from, to);
        }
        autoArmedRef.current = true;
        return true;
      },
      setDepth: (id, depth) => {
        pushHistory(`flip:${id}`, "front/back flip");
        const scale = bodyScaleRef.current;
        const updated = partsRef.current.map((p) =>
          p.id === id ? { ...p, depth } : p,
        );
        const from = derivePositions(partsRef.current, scale).get(id);
        const to = derivePositions(updated, scale).get(id);
        setParts(updated);
        if (from && to && (from.x !== to.x || from.y !== to.y)) {
          settleTween(id, from, to);
        }
        autoArmedRef.current = true;
      },
      endResize: (id) => {
        resizingRef.current = null;
        const internal = rf.getInternalNode(id);
        const part = partsRef.current.find((p) => p.id === id);
        if (!internal || !part) {
          setDragOverride(null);
          return;
        }
        const w = internal.measured?.width;
        const h = internal.measured?.height;
        const center = {
          x: internal.internals.positionAbsolute.x + (w ?? 0) / 2,
          y: internal.internals.positionAbsolute.y + (h ?? 0) / 2,
        };
        pushHistory(`resize:${id}`, "resize");
        const updated = partsRef.current.map((p) =>
          p.id === id
            ? {
                ...p,
                w: w ?? p.w,
                h: h ?? p.h,
                freePos: p.offBody ? center : p.freePos,
              }
            : p,
        );
        setParts(updated);
        if (part.offBody) {
          setDragOverride(null);
        } else {
          // Location is authoritative: the resized card re-centers on its
          // anchor with the same settle motion as a drop.
          const to = derivePositions(updated, bodyScaleRef.current).get(id);
          if (to) settleTween(id, center, to);
          else setDragOverride(null);
        }
        autoArmedRef.current = true;
      },
      updateArrow: (id, patch) => {
        pushHistory(
          `arrow-edit:${id}:${Object.keys(patch).join(",")}`,
          "label" in patch ? "arrow label" : "arrow style",
        );
        setArrows((as) =>
          as.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        );
      },
      connectParts: (sourceId, targetId) => {
        if (!sourceId || !targetId || sourceId === targetId) return;
        // No sourceHandle: a keyboard/menu link has no dragged-from dot, so
        // FloatingEdge falls back to its dynamic geometry on both ends.
        // Skip an exact duplicate so the picker can't silently stack a
        // second identical arrow the user can't tell apart.
        if (
          arrowsRef.current.some(
            (a) => a.sourceId === sourceId && a.targetId === targetId,
          )
        ) {
          return;
        }
        pushHistory("arrow-add", "arrow");
        setArrows((as) => [
          ...as,
          {
            id: newId("arrow"),
            sourceId,
            targetId,
            color: ARROW_COLORS[0],
          },
        ]);
      },
      reverseArrow: (id) => {
        pushHistory(`arrow-reverse:${id}`, "arrow reversed");
        setArrows((as) =>
          as.map((a) =>
            a.id === id
              ? {
                  ...a,
                  sourceId: a.targetId,
                  targetId: a.sourceId,
                  // The old sourceHandle described a side of the old
                  // source card — meaningless now that it's the target.
                  // Fall back to the dynamic geometry on both ends.
                  sourceHandle: undefined,
                }
              : a,
          ),
        );
      },
      deleteArrow: (id) => {
        pushHistory(`arrow-delete:${id}`, "arrow removed");
        setArrows((as) => as.filter((a) => a.id !== id));
        setSelectedEdgeId((prev) => (prev === id ? null : prev));
      },
      selectArrow: (id) => {
        setSelectedEdgeId(id);
      },
      registerPartInner: (id, el) => {
        if (el) innerElsRef.current.set(id, el);
        else innerElsRef.current.delete(id);
      },
    }),
    [rf, settleTween, pushHistory],
  );

  /* ——— creation: tap-to-place ——— */

  /** Add pressed: enter placement mode. The part is NOT created yet —
   *  the name and its would-be color ride along as a ghost until the
   *  tap. Pressing Add again with a new name simply replaces the ghost. */
  const beginPlacing = useCallback((name: string) => {
    const info = {
      name,
      color: PALETTE[colorCountRef.current % PALETTE.length],
    };
    placingRef.current = info;
    setPlacing(info);
    setPlacingTouch(false);
    sndPlay("lift");
    haptic(6);
  }, []);

  /** Leave placement mode without creating anything — the typed name
   *  goes back into the input, nothing is lost. */
  const cancelPlacing = useCallback(() => {
    const info = placingRef.current;
    if (!info) return;
    placingRef.current = null;
    setPlacing(null);
    setDraft(info.name);
  }, []);

  /** The tap gives the part its home: on/near a figure it lands on the
   *  nearest anchor with the full landing choreography (glide, pop,
   *  ripple, thump); on open canvas it settles off-body right there. */
  const placePart = useCallback(
    (client: XYPosition) => {
      const info = placingRef.current;
      if (!info) return;
      placingRef.current = null;
      setPlacing(null);
      const scale = bodyScaleRef.current;
      const flow = rf.screenToFlowPosition(client);
      const id = newId("part");
      pushHistory(`add:${id}`, `added “${info.name}”`);
      colorCountRef.current++;
      const base = {
        id,
        name: info.name,
        color: info.color,
        fontSize: "m" as const,
        bold: false,
        shape: "rounded" as const,
      };
      const { near, hit } = resolveMagnet(flow, scale);
      if (hit && near) {
        const part: Part = {
          ...base,
          location: near.region.key,
          depth: near.depth,
          offBody: false,
          freePos: flow,
        };
        const updated = [...partsRef.current, part];
        setParts(updated);
        // First paint at the tap point (same batch as the part itself),
        // then the settle glides it onto its anchor — landing effects at
        // touchdown, exactly like a drop.
        setDragOverride({ id, pos: flow });
        const to = derivePositions(updated, scale).get(id);
        if (to) {
          settleTween(id, flow, to, {
            onLand: () => {
              const now = Date.now();
              setDropPop({ id, key: now });
              setRipple({ pos: to, key: now });
              sndPlay("drop");
              haptic(8);
            },
          });
        } else {
          setDragOverride(null);
        }
      } else {
        const part: Part = {
          ...base,
          location: nearestOffZone(flow, scale),
          depth: "front",
          offBody: true,
          freePos: flow,
        };
        setParts((ps) => [...ps, part]);
        sndPlay("free");
        haptic(6);
      }
      // Desktop: select so the popover is ready. Phone: stay hands-off —
      // auto-opening the edit sheet would bury the landing it just made.
      if (!isPhoneRef.current) setSelectedId(id);
      autoArmedRef.current = true;
    },
    [rf, settleTween, pushHistory],
  );

  /* Placement mode: capture-phase listeners own the canvas (a stray pan
     must not fight the tap), a light rAF loop drives the ghost, the
     pulse ring, the landing dot, and the leader — the same visual
     language as a drag, without a card in hand yet. */
  useEffect(() => {
    if (!placing) return;
    const el = wrapperRef.current;
    if (!el) return;
    let pt: XYPosition | null = null;
    let lastKey = "";
    let seeded = false;
    const tick = { lastTickAt: 0 };
    indVelRef.current = { x: 0, y: 0 };
    // Park the spotlight off-scene until the pointer speaks.
    spotRef.current?.setAttribute("cx", "9999999");
    const isChrome = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest("[data-ui-chrome]");
    const onMove = (e: PointerEvent) => {
      pt = { x: e.clientX, y: e.clientY };
    };
    const onDown = (e: PointerEvent) => {
      if (isChrome(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerType === "touch") setPlacingTouch(true);
      pt = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (isChrome(e.target)) return;
      e.stopPropagation();
      placePart({ x: e.clientX, y: e.clientY });
    };
    const onClick = (e: MouseEvent) => {
      if (isChrome(e.target)) return;
      e.stopPropagation();
      e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelPlacing();
    };
    el.addEventListener("pointermove", onMove, true);
    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointerup", onUp, true);
    el.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const g = ghostRef.current;
      if (!pt) {
        // Nothing to aim from yet (touch, pre-contact): ghost hidden.
        if (g) g.style.opacity = "0";
        return;
      }
      const scale = bodyScaleRef.current;
      const flow = rf.screenToFlowPosition(pt);
      if (g) {
        g.style.opacity = "1";
        g.style.transform = `translate(${pt.x}px, ${pt.y}px)`;
      }
      const { near, hit } = resolveMagnet(flow, scale);
      let target: LiftTarget;
      let tpos: XYPosition;
      if (hit && near) {
        tpos = anchorToFlow(near.region, near.depth, scale);
        target = { kind: "region", key: near.region.key, depth: near.depth };
        const rk = `${near.region.key}:${near.depth}`;
        if (lastKey && lastKey !== rk) magnetTick(tick, 4);
        lastKey = rk;
      } else {
        target = FREE_TARGET;
        tpos = flow;
        lastKey = "";
      }
      setLiftTarget((prev) => (sameLiftTarget(prev, target) ? prev : target));
      if (!seeded) {
        indPosRef.current = { ...flow };
        seeded = true;
      }
      // Same landing-dot spring as the drag loop.
      const p = indPosRef.current;
      const v = indVelRef.current;
      v.x += (tpos.x - p.x) * 0.28;
      v.y += (tpos.y - p.y) * 0.28;
      v.x *= 0.68;
      v.y *= 0.68;
      p.x += v.x;
      p.y += v.y;
      if (leaderRef.current) {
        const len = Math.hypot(p.x - flow.x, p.y - flow.y);
        const sag = Math.min(26, len * 0.12);
        leaderRef.current.setAttribute(
          "d",
          `M ${flow.x} ${flow.y} Q ${(flow.x + p.x) / 2} ${
            (flow.y + p.y) / 2 + sag
          } ${p.x} ${p.y}`,
        );
        leaderRef.current.setAttribute("opacity", "0.55");
      }
      if (indicatorRef.current) {
        indicatorRef.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
      }
      if (ringRef.current) {
        const showRing = target.kind === "region";
        ringRef.current.style.opacity = showRing ? "1" : "0";
        ringRef.current.style.transform = `translate(${tpos.x}px, ${tpos.y}px)`;
      }
      if (spotRef.current) {
        spotRef.current.setAttribute("cx", String(flow.x));
        spotRef.current.setAttribute("cy", String(flow.y));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove, true);
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointerup", onUp, true);
      el.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
      setLiftTarget(null);
    };
  }, [placing, rf, placePart, cancelPlacing]);

  /* Opening the import modal is a change of intent — put the ghost away
     (name restored) rather than leaving a mode running underneath. */
  useEffect(() => {
    if (importOpen) cancelPlacing();
  }, [importOpen, cancelPlacing]);

  /* ——— import ——— */

  const doImport = useCallback(
    (text: string) => {
      const lines = parseImportText(text);
      if (!lines.length) return;
      const scale = bodyScaleRef.current;
      const placements = interpretLocations(lines, scale);
      let freeCount = 0;
      const newParts: Part[] = lines.map((l, i) => {
        const pl = placements[i];
        let freePos = pl.freePos;
        if (pl.offBody && !freePos) {
          // Unmatched: a visible grid below the front figure — a batch
          // that all landed off in one corner (the old off-right
          // fallback) was too easy to miss entirely.
          freePos = freeSpawnGrid(freeCount++, scale);
        } else if (freePos) {
          // stagger matched off-body zones so repeats don't stack
          freePos = { x: freePos.x + (i % 3) * 26, y: freePos.y + i * 16 };
        }
        return {
          id: newId("part"),
          name: l.name,
          location: pl.location,
          depth: pl.depth,
          offBody: pl.offBody,
          freePos: freePos ?? { x: 0, y: 0 },
          color: PALETTE[colorCountRef.current++ % PALETTE.length],
          fontSize: "m" as const,
          bold: false,
          shape: "rounded" as const,
        };
      });
      pushHistory("import", `imported ${newParts.length} parts`);
      const updated = [...partsRef.current, ...newParts];
      setParts(updated);
      autoArmedRef.current = true;
      const n = newParts.length;
      setNotice({
        text:
          freeCount > 0
            ? `Imported ${n} part${n === 1 ? "" : "s"} · ${freeCount} in free space`
            : `Imported ${n} part${n === 1 ? "" : "s"}`,
        key: Date.now(),
      });
      // Whole-map context orients better than zooming one cluster — an
      // import can scatter across both figures and free space at once.
      fitAll(updated);
    },
    [pushHistory, fitAll],
  );

  /* ——— persistence ——— */
  const onSave = useCallback(() => {
    downloadMap({
      version: 1,
      parts,
      arrows,
      bodyScale,
      autoScale,
      viewport: rf.getViewport(),
    });
    dirtyRef.current = false;
    setSaveStatus("saved");
    // The map now lives in a file; the reload-recovery draft has done its
    // job and would otherwise resurface as a stale "restore?" next visit.
    clearDraft();
    setNotice({ text: "Saved ✓", key: Date.now() });
  }, [parts, arrows, bodyScale, autoScale, rf]);

  /** The reset choreography shared by every "replace the whole map" path
   *  — file load and opening a cloud map alike. */
  const applyLoadedDoc = useCallback(
    (doc: MapDoc) => {
      cancelPlacing();
      cancelAnimationFrame(settleRafRef.current);
      cancelAnimationFrame(scaleRafRef.current);
      cancelAnimationFrame(restoreRafRef.current);
      settlingRef.current = false;
      setDragOverride(null);
      setParts(doc.parts);
      setArrows(doc.arrows);
      setBodyScale(doc.bodyScale);
      manualScaleRef.current = doc.bodyScale;
      setAutoScale(doc.autoScale);
      setSelectedId(null);
      setSelectedEdgeId(null);
      if (doc.viewport) rf.setViewport(doc.viewport);
      // A fresh document: yesterday's history belongs to the old map.
      historyRef.current = [];
      redoRef.current = [];
      setCanUndo(false);
      setCanRedo(false);
      setUndoLabel(null);
      setRedoLabel(null);
      setMeasuredDims(new Map());
      dirtyRef.current = false;
      setSaveStatus("clean");
      // A loaded map may open crowded — let the auto-grow pass judge it.
      autoArmedRef.current = true;
    },
    [rf, cancelPlacing],
  );

  /* ——— cloud maps (optional — signing in adds this on top of file
         save/load, which keeps working with no account at all) ——— */
  const [myMapsOpen, setMyMapsOpen] = useState(false);
  /** Which cloud map (if any) the canvas currently mirrors — lets "Save
   *  to cloud" update it in place instead of always creating a new one.
   *  Cleared by a file load/import and by opening a different cloud map. */
  const cloudDocRef = useRef<{ id: string; title: string } | null>(null);
  /** In-flight latch: "Save to cloud" lives in a menu that closes on tap,
   *  so nothing else stops a double-tap from creating two cloud copies. */
  const cloudSavingRef = useRef(false);
  const saveToCloud = useCallback(async () => {
    if (cloudSavingRef.current) return;
    cloudSavingRef.current = true;
    const doc: MapDoc = {
      version: 1,
      parts,
      arrows,
      bodyScale,
      autoScale,
      viewport: rf.getViewport(),
    };
    setSaveStatus("saving");
    setNotice({ text: "Saving to your maps…", key: Date.now() });
    try {
      if (cloudDocRef.current) {
        try {
          await updateMap(cloudDocRef.current.id, { doc });
        } catch (e) {
          // The mirrored map was deleted (e.g. in My Maps) — fall back to
          // saving a fresh copy instead of failing on every save forever.
          if (!(e instanceof CloudError && e.status === 404)) throw e;
          cloudDocRef.current = null;
        }
      }
      if (!cloudDocRef.current) {
        const title = `Parts Map – ${new Date().toISOString().slice(0, 10)}`;
        const created = await createMap(title, doc);
        cloudDocRef.current = { id: created.id, title: created.title };
      }
      dirtyRef.current = false;
      setSaveStatus("saved");
      clearDraft();
      setNotice({ text: "Saved to your maps ✓", key: Date.now() });
    } catch (e) {
      // Still unsaved — let the indicator and next debounce reflect that.
      setSaveStatus("dirty");
      setNotice({
        text: e instanceof CloudError ? e.message : "Couldn't save to your maps.",
        key: Date.now(),
      });
    } finally {
      cloudSavingRef.current = false;
    }
  }, [parts, arrows, bodyScale, autoScale, rf]);
  const onOpenCloudMap = useCallback(
    (id: string, title: string, doc: MapDoc) => {
      applyLoadedDoc(doc);
      cloudDocRef.current = { id, title };
      setNotice({ text: `Opened “${title}”`, key: Date.now() });
    },
    [applyLoadedDoc],
  );

  const onLoad = useCallback(
    async (file: File) => {
      try {
        const doc = await loadMapFile(file);
        applyLoadedDoc(doc);
        // A file load replaces whatever cloud map was open, if any.
        cloudDocRef.current = null;
      } catch (e) {
        // Two different failures used to show the same message: the file
        // genuinely couldn't be read (a mobile file picker can hand back an
        // undownloaded iCloud/Drive placeholder — a real plumbing failure,
        // not a bad file) vs. it read fine but isn't valid Parts Map JSON.
        const readFailure = e instanceof DOMException;
        setNotice({
          text: readFailure
            ? "Couldn't read that file — try picking it again."
            : "Couldn't read that file — it doesn't look like a Parts Map JSON.",
          key: Date.now(),
        });
      }
    },
    [applyLoadedDoc],
  );

  const onBodyScaleManual = useCallback((v: number) => {
    // Manual moves cancel any auto tween and never trigger auto-growth.
    cancelAnimationFrame(scaleRafRef.current);
    manualScaleRef.current = v;
    setBodyScale(v);
    markDirty();
  }, [markDirty]);

  /* ——— auto-save & opt-in local draft (v1.3) ————————————————————————
         The old "no storage at all" stance is now opt-in rather than
         absolute: a signed-in map keeps its cloud copy in sync on its own,
         and anyone may turn on a private on-device draft. Both are debounced
         off markDirty's nonce; neither stores anything without consent (the
         cloud requires an account; the draft requires the explicit toggle). */
  const currentDoc = useCallback(
    (): MapDoc => ({
      version: 1,
      parts: partsRef.current,
      arrows: arrowsRef.current,
      bodyScale: bodyScaleRef.current,
      autoScale: autoScaleRef.current,
      viewport: rf.getViewport(),
    }),
    [rf],
  );

  // Read the opt-in flag once on the client (localStorage is server-absent —
  // same hydration-safe shape as the welcome flag).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftEnabledState(getDraftEnabled());
  }, []);

  const toggleDraft = useCallback(
    (on: boolean) => {
      setDraftEnabled(on);
      setDraftEnabledState(on);
      if (on) saveDraft(currentDoc());
      setNotice({
        text: on
          ? "Keeping a private draft on this device."
          : "Local draft off — cleared from this device.",
        key: Date.now(),
      });
    },
    [currentDoc],
  );

  // Cloud auto-save: keep an already-cloud-saved map in sync. Deliberately
  // does NOT create a cloud map on its own — first persisting to the cloud
  // stays an explicit "Save to cloud". Debounced ~2.5s past the last edit.
  useEffect(() => {
    if (!session || !cloudDocRef.current || !dirtyRef.current) return;
    const t = window.setTimeout(() => {
      void saveToCloud();
    }, 2500);
    return () => window.clearTimeout(t);
  }, [dirtyNonce, session, saveToCloud]);

  // Local draft: mirror the map to localStorage while enabled, debounced
  // ~1.2s so a scrub of edits writes once.
  useEffect(() => {
    if (!draftEnabled || !dirtyRef.current) return;
    const t = window.setTimeout(() => saveDraft(currentDoc()), 1200);
    return () => window.clearTimeout(t);
  }, [dirtyNonce, draftEnabled, currentDoc]);

  // First client render: offer to restore a draft left by a prior visit.
  const draftOfferedRef = useRef(false);
  useEffect(() => {
    if (draftOfferedRef.current) return;
    draftOfferedRef.current = true;
    if (!getDraftEnabled()) return;
    const json = readDraftJson();
    if (!json) return;
    let doc: MapDoc;
    try {
      doc = parseMapJson(json);
    } catch {
      clearDraft();
      return;
    }
    if (doc.parts.length === 0) return;
    setNotice({
      text: "Restore your last map?",
      key: Date.now(),
      ttlMs: 15000,
      action: {
        label: "Restore",
        run: () => {
          applyLoadedDoc(doc);
          cloudDocRef.current = null;
        },
      },
    });
  }, [applyLoadedDoc]);

  /* ——— unsaved-changes guard: prompt before the tab closes with work
         that never reached a file or (for a signed-in cloud map) the last
         auto-save. Belt-and-suspenders alongside the opt-in draft above. ——— */
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, []);

  /* ——— keyboard: Ctrl/Cmd+Z undo, Escape puts things down, Enter opens
         the selected part's name for editing. Deliberately minimal. ——— */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      // Redo: Ctrl/Cmd+Shift+Z or Ctrl+Y. Checked first so Shift+Z doesn't
      // fall through to undo.
      if (mod && ((e.shiftKey && key === "z") || key === "y")) {
        if (typing || liftInfoRef.current || placingRef.current) return;
        e.preventDefault();
        redo();
        return;
      }
      if (mod && !e.shiftKey && key === "z") {
        // Fields keep their own text undo; mid-drag / mid-placement the
        // map is in the hand, not on the table.
        if (typing || liftInfoRef.current || placingRef.current) return;
        e.preventDefault();
        undo();
        return;
      }
      if (typing || placingRef.current) return;
      if (e.key === "Escape") {
        // Whichever modal is on top closes first — MyMaps and Welcome used
        // to have no Escape path at all (only Import did).
        if (importOpen) setImportOpen(false);
        else if (myMapsOpen) setMyMapsOpen(false);
        else if (welcomeOpen) setWelcomeOpen(false);
        else {
          setSelectedEdgeId(null);
          setSelectedId(null);
        }
        return;
      }
      if (e.key === "Enter" && selectedId) {
        // The open editor (popover or sheet) carries the name field.
        const el = document.querySelector<HTMLInputElement>(
          "[data-part-name-input]",
        );
        if (el) {
          e.preventDefault();
          el.focus();
          el.select();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, importOpen, myMapsOpen, welcomeOpen, selectedId]);


  /* ——— auto-space / anti-crowding (armed only by placement events).
         Reworked to actually make a difference: one decisive move to the
         scale that RESOLVES the worst crowding (not a timid nudge), and
         the reverse — when parts leave or spread out, the body relaxes
         back down (never below the hand-set slider value). Every move
         announces itself in a small pill with one-tap Undo. ——— */
  useEffect(() => {
    // NOTE: no useNodesInitialized gate — historically it reported false
    // forever because measurements weren't echoed back through the
    // controlled nodes (fixed via measuredDims); the pair loop skipping
    // unmeasured nodes still covers the brief pre-measure window.
    if (!autoScale || !autoArmedRef.current) return;
    if (lift || dragOverride || settlingRef.current) return;
    const timer = setTimeout(() => {
      if (
        !autoArmedRef.current ||
        liftInfoRef.current ||
        settlingRef.current
      ) {
        return;
      }
      autoArmedRef.current = false;
      const onBody = partsRef.current.filter((p) => {
        const r = REGION_BY_KEY[p.location];
        return !p.offBody && r && !r.offBody;
      });
      const cur = bodyScaleRef.current;
      const floor = Math.max(MIN_SCALE, manualScaleRef.current);
      if (onBody.length < 2) {
        // Nothing left to crowd — ease all the way back to the hand-set
        // floor rather than staying stuck large.
        if (cur > floor + 0.02) {
          animateBodyScale(floor);
          setNotice({
            text: `Auto-space: eased back (${Math.round((floor / cur - 1) * 100)}%)`,
            key: Date.now(),
            action: { label: "Undo", run: () => animateBodyScale(cur) },
            ttlMs: 8000,
          });
        }
        return;
      }
      const posMap = derivePositions(partsRef.current, cur);
      const PAD = 14;
      // For each pair, the scale factor at which it is exactly
      // comfortable (anchors spread linearly with scale; card sizes
      // don't scale — separation on either axis suffices).
      let growF = 1; // factor needed to resolve the worst crowding
      let slackF = 0; // smallest factor at which EVERY pair stays clear
      for (let i = 0; i < onBody.length; i++) {
        for (let j = i + 1; j < onBody.length; j++) {
          const a = onBody[i];
          const b = onBody[j];
          // Anchored on the same point: scaling can't separate them
          // (the spiral nudge does).
          if (a.location === b.location && a.depth === b.depth) {
            continue;
          }
          const ia = rf.getInternalNode(a.id);
          const ib = rf.getInternalNode(b.id);
          const wa = ia?.measured?.width;
          const ha = ia?.measured?.height;
          const wb = ib?.measured?.width;
          const hb = ib?.measured?.height;
          if (!wa || !ha || !wb || !hb) continue;
          const pa = posMap.get(a.id)!;
          const pb = posMap.get(b.id)!;
          const dx = Math.abs(pa.x - pb.x);
          const dy = Math.abs(pa.y - pb.y);
          const needX = (wa + wb) / 2 + PAD;
          const needY = (ha + hb) / 2 + PAD;
          const fx = dx > 2 ? needX / dx : Infinity;
          const fy = dy > 2 ? needY / dy : Infinity;
          const req = Math.min(fx, fy);
          if (!Number.isFinite(req)) continue;
          slackF = Math.max(slackF, req);
          if (dx < needX && dy < needY) growF = Math.max(growF, req);
        }
      }
      let target: number | null = null;
      if (growF > 1.02) {
        // Crowded: go straight to the scale that clears it (small
        // cushion, capped per pass so one drop never doubles the body).
        target = Math.min(cur * Math.min(growF * 1.04, 1.5), MAX_SCALE);
      } else if (slackF > 0.05 && slackF < 0.88 && cur > floor + 0.02) {
        // Everything comfortably clear: relax back toward the hand-set
        // floor, keeping a cushion above the tightest pair. The 0.88
        // gate (12% real slack) keeps grow/relax from oscillating.
        target = Math.max(cur * slackF * 1.08, floor);
      }
      if (target !== null && Math.abs(target - cur) > 0.01) {
        animateBodyScale(target);
        const pct = Math.round((target / cur - 1) * 100);
        if (pct !== 0) {
          setNotice({
            text:
              pct > 0
                ? `Auto-space: made room (+${pct}%)`
                : `Auto-space: eased back (${pct}%)`,
            key: Date.now(),
            action: { label: "Undo", run: () => animateBodyScale(cur) },
            ttlMs: 8000,
          });
        }
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [
    parts,
    autoScale,
    lift,
    dragOverride,
    rf,
    animateBodyScale,
  ]);

  /* The notice pill quietly excuses itself. */
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), notice.ttlMs ?? 4500);
    return () => clearTimeout(t);
  }, [notice]);

  /** Pan bounds: the scene plus any off-body strays, with breathing room.
   *  Deliberately keyed on `parts`/`bodyScale` only — never on drag state —
   *  so it's stable for the length of any gesture and only ever widens or
   *  narrows on a committed mutation (add/move/delete/import/rescale). */
  const translateExtent = useMemo(
    () => mapExtent(parts, bodyScale),
    [parts, bodyScale],
  );

  /* ——— derived views: one parts array → nodes + list ——— */
  const nodes: Node[] = useMemo(() => {
    const posMap = derivePositions(parts, bodyScale);
    return parts.map((p) => {
      const md = measuredDims.get(p.id);
      return {
        id: p.id,
        type: "part" as const,
        position:
          dragOverride?.id === p.id ? dragOverride.pos : posMap.get(p.id)!,
        width: p.w,
        height: p.h,
        // Echo RF's own measurement back so adoptUserNodes doesn't wipe it
        // on every rebuild of these fresh node objects (RF error #015).
        measured: md ? { width: md.w, height: md.h } : undefined,
        selected: p.id === selectedId,
        // The only accessible-name a screen reader gets for this card —
        // previously just whatever text happened to be inside it, so
        // location/note/surface never reached assistive tech at all.
        ariaLabel: `${p.name} — ${locationDisplay(p)}${p.note ? ", has a note" : ""}`,
        data: {
          part: p,
          lifted: lift?.id === p.id,
          popKey: dropPop?.id === p.id ? dropPop.key : 0,
          revealKey: reveal?.id === p.id ? reveal.key : 0,
        },
      };
    });
  }, [
    parts,
    bodyScale,
    dragOverride,
    selectedId,
    lift,
    dropPop,
    reveal,
    measuredDims,
  ]);

  const edges: Edge[] = useMemo(
    () =>
      arrows.map((a) => ({
        id: a.id,
        type: "floating" as const,
        source: a.sourceId,
        target: a.targetId,
        selected: a.id === selectedEdgeId,
        data: { color: a.color, label: a.label, sourceHandle: a.sourceHandle },
        style: { stroke: a.color, strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: a.color,
          width: 16,
          height: 16,
        },
      })),
    [arrows, selectedEdgeId],
  );

  return (
    <AppApiContext.Provider value={api}>
     <PartsListContext.Provider value={parts}>
      <div
        ref={wrapperRef}
        className="relative h-dvh w-full"
        style={{ background: "var(--canvas)" }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onMove={onMove}
          onPaneClick={() => {
            setSelectedId(null);
            setSelectedEdgeId(null);
            // On phone the list is a sheet over the canvas — a tap on the
            // map means "let me see it."
            if (isPhoneRef.current) setListOpen(false);
          }}
          nodeOrigin={[0.5, 0.5]}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={40}
          connectionLineComponent={ConnectionLine}
          connectOnClick={false}
          minZoom={0.15}
          maxZoom={4}
          translateExtent={translateExtent}
          zoomOnDoubleClick={false}
          // The drag-follow camera owns edge-following during drags; RF's
          // own auto-pan would double-pan. Reduced motion turns our camera
          // glides off, so RF's (functional, not decorative) pan returns.
          autoPanOnNodeDrag={reducedMotion}
          nodeDragThreshold={4}
          nodeClickDistance={8}
          paneClickDistance={8}
          multiSelectionKeyCode={null}
          selectionOnDrag={false}
          deleteKeyCode={["Backspace", "Delete"]}
          // Off-screen cards/arrows skip rendering entirely — relevant once
          // a map gets crowded (30-60+ parts) or the camera is zoomed into
          // one figure. The actively dragged/lifted node is always under
          // the pointer, so it's never the thing that's off-screen.
          onlyRenderVisibleElements
          style={{ background: "var(--canvas)" }}
        >
          <ViewportPortal>
            <div
              style={{
                position: "absolute",
                zIndex: -1,
                pointerEvents: "none",
              }}
            >
              <BodyOutline bodyScale={bodyScale} />
              <AnchorConstellation
                bodyScale={bodyScale}
                visible={!!lift || !!placing}
                boost={!!placing}
                spotRef={spotRef}
              />
            </div>
            {ripple && (
              <div
                key={ripple.key}
                className="drop-ripple"
                style={{
                  position: "absolute",
                  left: ripple.pos.x,
                  top: ripple.pos.y,
                  zIndex: 1100,
                  pointerEvents: "none",
                }}
              />
            )}
            <LiftOverlay
              target={liftTarget}
              touch={lift?.isTouch ?? placingTouch}
              leaderRef={leaderRef}
              indicatorRef={indicatorRef}
              ringRef={ringRef}
            />
          </ViewportPortal>
        </ReactFlow>

        {/* Phone-only Front/Back jump: glides the camera between the two
            figures (framing is per-figure on narrow screens). */}
        <div
          data-ui-chrome
          className="absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex -translate-x-1/2 gap-0.5 rounded-full p-1 sm:hidden"
          style={{ ...panelStyle, touchAction: "manipulation" }}
        >
          {(["front", "back"] as const).map((d) => (
            <button
              key={d}
              aria-label={`Show ${d} figure`}
              aria-pressed={viewSide === d}
              className="rounded-full px-3.5 py-1 text-[11px] uppercase tracking-[0.12em] transition-colors"
              style={
                viewSide === d
                  ? { background: "var(--accent)", color: "#fff" }
                  : { color: "var(--ink-soft)" }
              }
              onClick={() => jumpToFigure(d)}
            >
              {d}
            </button>
          ))}
        </div>
        <Toolbar
          onAdd={beginPlacing}
          nameValue={draft}
          onNameChange={setDraft}
          onImportOpen={() => setImportOpen(true)}
          bodyScale={bodyScale}
          onBodyScale={onBodyScaleManual}
          autoScale={autoScale}
          onAutoScale={(v) => {
            setAutoScale(v);
            markDirty();
          }}
          onSave={onSave}
          onLoad={onLoad}
          listOpen={listOpen}
          onToggleList={() => setListOpen((v) => !v)}
          soundOn={soundOn}
          onToggleSound={() => setSoundOn((v) => !v)}
          onShowWelcome={reopenWelcome}
          onOpenMyMaps={() => setMyMapsOpen(true)}
          onSaveToCloud={saveToCloud}
          saveStatus={saveStatus}
          draftEnabled={draftEnabled}
          onToggleDraft={toggleDraft}
          canUndo={canUndo}
          canRedo={canRedo}
          undoLabel={undoLabel}
          redoLabel={redoLabel}
          onUndo={undo}
          onRedo={redo}
        />
        <FrameMapButton
          onFrame={() => {
            fitAll();
            setFramedTick((t) => t + 1);
          }}
        />
        {/* Parts list — a docked side panel on desktop, a bottom sheet on
            phones (hidden while dragging/placing, like the edit sheet). */}
        {isPhone ? (
          <PhonePartsSheet
            parts={parts}
            arrows={arrows}
            bodyScale={bodyScale}
            open={listOpen && !lift && !placing}
            onReveal={revealPart}
            onClose={() => setListOpen(false)}
            onExportMenuOpenChange={setExportMenuOpen}
            onNotice={(text) => setNotice({ text, key: Date.now() })}
          />
        ) : (
          <PartsListPanel
            parts={parts}
            arrows={arrows}
            bodyScale={bodyScale}
            open={listOpen}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReveal={revealPart}
            onClose={() => setListOpen(false)}
            onExportMenuOpenChange={setExportMenuOpen}
            onNotice={(text) => setNotice({ text, key: Date.now() })}
          />
        )}
        {/* Phone card editor — bottom sheet; hides while dragging/placing
            so it never covers a landing. */}
        <MobileEditSheet
          part={parts.find((p) => p.id === selectedId) ?? null}
          open={
            isPhone &&
            !!selectedId &&
            parts.some((p) => p.id === selectedId) &&
            !lift &&
            !placing
          }
          onClose={() => setSelectedId(null)}
        />
        {/* Quiet notice pill: what just happened, sometimes one action. */}
        {notice && (
          <div
            key={notice.key}
            data-ui-chrome
            role="status"
            className="fade-in absolute bottom-[calc(76px+env(safe-area-inset-bottom))] left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full py-1.5 pl-4 pr-1.5 sm:bottom-auto sm:top-16"
            style={{ ...panelStyle, touchAction: "manipulation" }}
          >
            <span
              className="whitespace-nowrap text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {notice.text}
            </span>
            {notice.action ? (
              <button
                className="rounded-full px-2.5 py-1 text-[11px]"
                style={{ background: "rgba(0,0,0,0.05)", color: "var(--ink)" }}
                onClick={() => {
                  notice.action!.run();
                  setNotice(null);
                }}
              >
                {notice.action.label}
              </button>
            ) : (
              <span className="pr-1.5" />
            )}
          </div>
        )}
        <ImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImport={doImport}
        />
        <MyMapsModal
          open={myMapsOpen}
          onClose={() => setMyMapsOpen(false)}
          getCurrentDoc={() => ({
            version: 1,
            parts,
            arrows,
            bodyScale,
            autoScale,
            viewport: rf.getViewport(),
          })}
          isDirty={() => dirtyRef.current}
          onOpenMap={onOpenCloudMap}
        />
        {parts.length === 0 && !placing && (
          <div className="fade-in pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center sm:top-20">
            <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
              Name a part to begin — then tap where it lives.
            </p>
          </div>
        )}
        {placing && (
          <>
            {/* Ghost card: the part-to-be, held by the hand. Screen-space,
                transform written by the placement loop. */}
            <div
              ref={ghostRef}
              className="pointer-events-none absolute left-0 top-0 z-30"
              style={{ opacity: 0, willChange: "transform" }}
            >
              <div
                className="part-inner lifted px-4 py-3 text-center leading-snug"
                style={{
                  background: placing.color,
                  color: "var(--ink)",
                  borderRadius: 14,
                  fontSize: 14,
                  maxWidth: 180,
                  border: "1px solid rgba(58,55,51,0.08)",
                  transform:
                    "translate(-50%, -60%) scale(1.03) rotate(-1.5deg)",
                }}
              >
                {placing.name}
              </div>
            </div>
            {/* Hint pill — the mode's only chrome. Sits above the thumb
                bar on phones, under the top bar on desktop. */}
            <div
              data-ui-chrome
              className="fade-in absolute bottom-[calc(76px+env(safe-area-inset-bottom))] left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full py-1.5 pl-4 pr-1.5 sm:bottom-auto sm:top-16"
              style={{ ...panelStyle, touchAction: "manipulation" }}
            >
              <span
                className="max-w-[60vw] truncate text-xs"
                style={{ color: "var(--ink-soft)" }}
              >
                Tap where “{placing.name}” lives
              </span>
              <button
                aria-label="Cancel placing"
                className="rounded-full px-2 py-1 text-xs hover:bg-black/5 pointer-coarse:min-h-8 pointer-coarse:min-w-8"
                style={{ color: "var(--ink-faint)" }}
                onClick={cancelPlacing}
              >
                ✕
              </button>
            </div>
          </>
        )}
        <datalist id="region-labels">
          {REGIONS.map((r) => (
            <option key={r.key} value={r.label} />
          ))}
        </datalist>
        <WelcomeModal
          open={welcomeOpen}
          onClose={closeWelcome}
          onStartTour={startTour}
          onExplore={() => {
            applyLoadedDoc(sampleMap());
            closeWelcome();
          }}
        />
        {/* Hidden during tap-to-place (its own hint pill already carries
            the guidance) and hidden behind an open phone list sheet
            until the list itself closes — see tourVisible above. */}
        {tourVisible && (
          <CoachMarks step={tourStep!} snapshot={tourSnapshot} onSkip={skipTour} />
        )}
      </div>
     </PartsListContext.Provider>
    </AppApiContext.Provider>
  );
}

export default function PartsMap() {
  return (
    <ReactFlowProvider>
      <PartsMapApp />
    </ReactFlowProvider>
  );
}
