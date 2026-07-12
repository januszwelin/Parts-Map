"use client";

/**
 * Parts Map — a spatial canvas for IFS parts work.
 *
 * The main orchestrator: owns the single parts/arrows dataset, the
 * bespoke drag/magnet/camera choreography (rAF loops writing straight
 * to the DOM), undo history, part spawn, auto-space, save/load, and
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
  MiniMap,
  MarkerType,
  ConnectionMode,
  SelectionMode,
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
  SINGLE_SCENE_W,
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
  ARROW_INK,
} from "@/lib/tuning";
import { REGION_BY_KEY } from "@/lib/regions";
import {
  newId,
  type Depth,
  type Part,
  type Arrow,
  type MapDoc,
  type HandleSide,
} from "@/lib/types";
import {
  anchorToFlow,
  offBodySuggestion,
  nearestTarget,
  MIN_ANCHOR_GAP,
  overBody,
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
import { downloadMapPng } from "@/lib/exports";
import { createMap, updateMap, CloudError } from "@/lib/cloud";
import { authClient } from "@/lib/auth-client";
import {
  getDraftEnabled,
  setDraftEnabled,
  saveDraft,
  readDraftJson,
  clearDraft,
} from "@/lib/draft";
import { getScrollPan, setScrollPan, getMinimap, setMinimap } from "@/lib/prefs";
import { haptic, hapticTick } from "@/lib/haptics";
import { getWelcomeSeen, setWelcomeSeen } from "@/lib/onboarding";
import { sampleMap } from "@/lib/sample-map";
import { partSurface, locationDisplay } from "@/lib/part-utils";
import { cardStyle, panelStyle } from "@/lib/ui";
import {
  AppApiContext,
  PartsListContext,
  ArrowsListContext,
  type AppApi,
} from "@/hooks/use-app-api";
import { useIsPhone, useReducedMotion } from "@/hooks/use-media";
import {
  BodyOutline,
  AnchorConstellation,
} from "@/components/body-outline";
import { MobileEditSheet } from "@/components/part-editor";
import { PartNode } from "@/components/part-node";
import { FloatingEdge, ConnectionLine, ArrowEditSheet } from "@/components/floating-edge";
import {
  LiftOverlay,
  MOVING_TARGET,
  FREE_TARGET,
  type LiftTarget,
} from "@/components/lift-overlay";
import { Toolbar, FrameMapButton } from "@/components/toolbar";
import { ZoomPill } from "@/components/zoom-pill";
import { ShortcutsModal } from "@/components/shortcuts-modal";
import { PartsListPanel, PhonePartsSheet } from "@/components/parts-list";
import { PhoneTopBar } from "@/components/phone-top-bar";
import { PhoneQuickTools } from "@/components/phone-quick-tools";
import { CreateSheet, ShareSheet, MoreSheet, RenameSheet } from "@/components/phone-sheets";
import { ImportModal } from "@/components/import-modal";
import { WelcomeModal } from "@/components/welcome";
import { MyMapsModal } from "@/components/my-maps";
import {
  CoachMarks,
  TOUR_STEPS,
  PHONE_TOUR_STEPS,
  type TourSnapshot,
} from "@/components/coach-marks";
import { useTourLock } from "@/hooks/use-tour-lock";

/* ════════════════════════════════════════════════════════════════════
   9. MAIN APP
   ════════════════════════════════════════════════════════════════════ */

const nodeTypes = { part: PartNode };
const edgeTypes = { floating: FloatingEdge };

/** Shared empty selection — a stable reference so "nothing selected"
 *  never churns state identity. */
const EMPTY_SET: ReadonlySet<string> = new Set();

/** Desktop pan buttons: middle/right-drag pans (Miro parity); the left
 *  button belongs to selection — bare left-drag on empty canvas draws a
 *  marquee, and holding Space (RF's default panActivationKeyCode) turns
 *  left-drag into a pan. Module-scope for a stable identity. */
const DESKTOP_PAN_BUTTONS = [1, 2];

/** One-shot keys for transient UI (notice pill, reveal glow). A monotonic
 *  counter, never a timestamp: two transients born in the same millisecond
 *  once shared a Date.now() key as SIBLINGS (the completion notice + the
 *  tour-done wash), and React's duplicate-key reconciliation corrupted the
 *  whole sibling list — the always-mounted bottom sheets included. */
let transientSeq = 0;
const noticeKey = () => ++transientSeq;

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
  // Selection is a set — the desktop marquee can catch several at once.
  // Everything single-part (edit popover/sheet, Enter-rename, tour) keys
  // off the derived `selectedId`, which is non-null only for EXACTLY one
  // selection, so a multi-select never summons an editor.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(EMPTY_SET);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<ReadonlySet<string>>(EMPTY_SET);
  const selectedId =
    selectedIds.size === 1 ? selectedIds.values().next().value! : null;
  const selectedEdgeId =
    selectedEdgeIds.size === 1 ? selectedEdgeIds.values().next().value! : null;
  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIds(id ? new Set([id]) : EMPTY_SET);
  }, []);
  const setSelectedEdgeId = useCallback((id: string | null) => {
    setSelectedEdgeIds(id ? new Set([id]) : EMPTY_SET);
  }, []);
  // Mirror for gesture handlers (drag start fires from RF, outside the
  // render that produced the selection) — synced in an effect below.
  const selectedIdsRef = useRef<ReadonlySet<string>>(EMPTY_SET);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);
  const [dragOverride, setDragOverride] = useState<{
    id: string;
    pos: XYPosition;
  } | null>(null);
  // Off-body GROUP drag (a multi-selection where every member is
  // off-body): RF natively drags the whole selection — no lift/magnet
  // choreography — and its per-node position changes fold into this
  // transient map, one setState per change batch. The ref names the
  // dragged ids for the duration of the gesture.
  const [multiDrag, setMultiDrag] = useState<ReadonlyMap<
    string,
    XYPosition
  > | null>(null);
  const multiDragRef = useRef<ReadonlySet<string> | null>(null);
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
  // Keyboard-shortcuts card (desktop) — toolbar Help menu or the "?" key.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  /** The current map's name, shown in the phone top bar. Set when a cloud
   *  map is opened / saved and when a file is loaded; "Untitled map" until
   *  then. Display-only — rename still lives in My Maps. */
  const [mapTitle, setMapTitle] = useState("Untitled map");
  /** Which phone bottom sheet is open (create / share / more / rename),
   *  or none. One at a time, and never over the edit sheet or a
   *  drag/placement. */
  const [phoneSheet, setPhoneSheet] = useState<
    "create" | "share" | "more" | "rename" | null
  >(null);
  /** Set when the list sheet is opened via the top-bar search, so it can
   *  focus its filter; cleared when the list closes. */
  const [listSearchFocus, setListSearchFocus] = useState(false);
  /** The Add input's text — lives here (not in the toolbar/sheet) so both
   *  desktop and phone share one draft. */
  const [draft, setDraft] = useState("");
  const isPhone = useIsPhone();
  const reducedMotion = useReducedMotion();
  const isPhoneRef = useRef(false);
  useEffect(() => {
    isPhoneRef.current = isPhone;
  }, [isPhone]);
  // Sheets are JS-gated by isPhone (the shell's old `sm:hidden` CSS gate
  // disagreed with useIsPhone on ≥640px landscape phones); if the layout
  // flips to desktop mid-session, put any open phone sheet away. Render-time
  // adjustment, not an effect — React re-renders before committing.
  if (!isPhone && phoneSheet !== null) setPhoneSheet(null);
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
  /** Which layout's step array the running tour follows — the locked
   *  guided flow on phone, the classic watch-only tour on desktop.
   *  Fixed at startTour; a mid-tour layout flip ends the tour. */
  const [tourMode, setTourMode] = useState<"phone" | "desktop" | null>(null);
  /** Bumped when the lock guard swallows a tap, so the callout pulses. */
  const [tourNudge, setTourNudge] = useState(0);
  /** The one pending shepherd timer (auto-select after a landing;
   *  auto-reselect during the link step) — cleared on step change and
   *  tour end so a Skip never fires a ghost selection later. */
  const tourTimerRef = useRef<number | null>(null);
  const tourStepRef = useRef<number | null>(null);
  useEffect(() => {
    tourStepRef.current = tourStep;
  }, [tourStep]);
  /** The most recently added part — the tour's place/edit/link steps
   *  anchor their spotlight to its card. */
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  /** One-shot soft accent wash when the tour completes (calm celebration);
   *  keyed so a re-run replays it, cleared by its own animationend. */
  const [tourDoneKey, setTourDoneKey] = useState<number | null>(null);
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
  const startTour = useCallback(
    /** `counts` overrides the baseline for callers that just replaced the
     *  whole map in this same tick (the "Explore an example" path) — the
     *  refs this reads otherwise still hold the pre-load map. */
    (counts?: { parts: number; arrows: number; onBody: number }) => {
      setWelcomeOpen(false);
      setWelcomeSeen();
      // Timer hygiene lives here too, not only in endTour — a re-entry
      // path that skips endTour must never inherit a stale auto-select.
      if (tourTimerRef.current !== null) {
        clearTimeout(tourTimerRef.current);
        tourTimerRef.current = null;
      }
      const phone = isPhoneRef.current;
      if (phone) {
        // A locked step must not start buried: clear every covering
        // surface so step 1's + button is the only thing lit — and no
        // lingering notice action (the draft-restore "Restore" would be
        // tappable through the lock and swap the map mid-tour).
        setSelectedId(null);
        setSelectedEdgeId(null);
        setListOpen(false);
        setPhoneSheet(null);
        setExportMenuOpen(false);
        setNotice(null);
      }
      tourBaselineRef.current = {
        partsCount: counts?.parts ?? partsRef.current.length,
        arrowsCount: counts?.arrows ?? arrowsRef.current.length,
        onBodyCount:
          counts?.onBody ??
          partsRef.current.filter((p) => !p.offBody).length,
        lastAddedId: null,
        selectedId: phone ? null : selectedId,
        listOpen: phone ? false : listOpen,
        exportMenuOpen: phone ? false : exportMenuOpen,
        createSheetOpen: false,
        framedTick,
        isPhone: phone,
      };
      setTourMode(phone ? "phone" : "desktop");
      setTourStep(0);
    },
    [selectedId, listOpen, exportMenuOpen, framedTick, setSelectedId, setSelectedEdgeId],
  );
  /** Every way the tour stops (skip, completion, layout flip, welcome
   *  reopening) funnels through here so the shepherd timer can never
   *  fire a ghost selection afterwards. */
  const endTour = useCallback(() => {
    if (tourTimerRef.current !== null) {
      clearTimeout(tourTimerRef.current);
      tourTimerRef.current = null;
    }
    tourBaselineRef.current = null;
    setTourStep(null);
    setTourMode(null);
  }, []);
  const skipTour = endTour;
  /** The "?" button — always reopens the welcome choice, even mid-tour. */
  const reopenWelcome = useCallback(() => {
    endTour();
    setWelcomeOpen(true);
  }, [endTour]);
  const onBodyCount = useMemo(
    () => parts.filter((p) => !p.offBody).length,
    [parts],
  );
  const tourSnapshot: TourSnapshot = useMemo(
    () => ({
      partsCount: parts.length,
      arrowsCount: arrows.length,
      onBodyCount,
      lastAddedId,
      selectedId,
      listOpen,
      exportMenuOpen,
      createSheetOpen: phoneSheet === "create",
      framedTick,
      isPhone,
    }),
    [parts.length, arrows.length, onBodyCount, lastAddedId, selectedId, listOpen, exportMenuOpen, phoneSheet, framedTick, isPhone],
  );
  // (The advance effect lives further down, after fitAll/revealPart exist —
  // its auto-choreography drives them between steps.)
  const tourSteps = tourMode === "phone" ? PHONE_TOUR_STEPS : TOUR_STEPS;
  const tourStepDef = tourStep !== null ? tourSteps[tourStep] : null;
  const tourStepId = tourStepDef?.id ?? null;
  /** The locked guided flow is running — gates for systems that must not
   *  move the stage or accept hardware input under it (auto-space, RF
   *  delete key, wheel zoom, undo/redo). Ref twin for timer callbacks. */
  const tourLocked = tourMode === "phone" && tourStep !== null;
  const tourLockedRef = useRef(false);
  useEffect(() => {
    tourLockedRef.current = tourLocked;
  }, [tourLocked]);
  /** Which phone surface currently covers the stage (one at a time by
   *  policy). Steps that live inside a sheet name it via `sheet()`; their
   *  callouts show only while that sheet is the covering surface. */
  const phoneCovering: string | null =
    selectedId !== null
      ? "edit"
      : selectedEdgeId !== null
        ? "arrow"
        : listOpen
          ? "list"
          : phoneSheet;
  /** Coach bubbles never render over the wrong surface. Locked phone
   *  tour: a step's callout shows exactly when its own surface (or the
   *  bare stage) is up — sheet-anchored steps ride above their sheet.
   *  Desktop keeps the classic hold-back-behind-overlays rule. */
  const tourVisible =
    tourStep !== null &&
    // The callout gets out of the way of the very drag it teaches; it
    // reappears (or the step advances) on drop.
    !lift &&
    (tourMode === "phone"
      ? (tourStepDef?.sheet?.(tourSnapshot) ?? null) === phoneCovering
      : !(listOpen && tourStepId !== "list") &&
        !(
          isPhone &&
          (selectedId !== null || selectedEdgeId !== null || phoneSheet !== null) &&
          tourStepId !== "list"
        ));
  /** The locked phone tour's input guard — only the current step's
   *  target (plus Skip and the notice pill) is touchable. Detaches the
   *  instant the tour ends; nothing in the DOM is mutated. */
  useTourLock({
    enabled: tourLocked,
    allow: tourStepDef?.allow?.(tourSnapshot) ?? [],
    scrollWithin: tourStepDef?.scrollWithin?.(tourSnapshot) ?? [],
    onBlocked: () => {
      setTourNudge((k) => k + 1);
      haptic(4);
    },
  });
  // A layout flip mid-tour would leave the wrong step array (and on
  // phone, the lock) active — end the tour cleanly instead. An effect,
  // not a render adjustment: endTour also clears the shepherd timer ref.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tourMode !== null && (tourMode === "phone") !== isPhone) endTour();
  }, [tourMode, isPhone, endTour]);
  /** True while the locked tour's place steps run — onNodesChange drops
   *  card selections then (React Flow selects on both tap and drag
   *  start, which would summon the edit sheet over the very card being
   *  placed); the tour engine opens the editor itself once the landing
   *  settles. */
  const tourSuppressSelectRef = useRef(false);
  useEffect(() => {
    tourSuppressSelectRef.current =
      tourMode === "phone" &&
      (tourStepId === "place" || tourStepId === "place2");
  }, [tourMode, tourStepId]);

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
    // Same-tick pushes see the same refs (they advance in an effect), so
    // their snapshots are reference-identical — the same restore point.
    // Merge instead of stacking: RF dispatches a delete cascade as edge
    // removes THEN node removes in one tick, which otherwise costs two
    // Ctrl+Z presses to undo one Delete.
    if (
      top &&
      top.parts === partsRef.current &&
      top.arrows === arrowsRef.current
    ) {
      top.at = now;
      top.tag = tag;
      top.label = label;
      setUndoLabel(label);
      return;
    }
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
    // Phones get no dot-drag hint: selecting a card opens the edit sheet
    // (which has an explicit Draw-arrow field) at the same instant, and
    // the pill would land right on the sheet's lower fields.
    if (isPhoneRef.current) return;
    if (!(window.matchMedia?.("(pointer: coarse)").matches ?? false)) return;
    linkHintShownRef.current = true;
    setNotice({
      text: "Drag a dot on the card’s edge to link parts",
      key: noticeKey(),
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

  /** True once the user (or a loaded map) has taken the camera — after that
   *  we never auto-re-frame out from under them. Flipped by pane pan/zoom
   *  (onMoveStart with a real event), grabbing a part, placement, any glide,
   *  and map load; programmatic setViewport (our own framing) never flips it. */
  const userAdjustedRef = useRef(false);

  /* ——— initial camera: one body centered at flow 0,0, framed with room
         for the side park lanes so the hidden surface's cards are visible
         at the edges. Same on phone and desktop. ——— */
  const frameInitial = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const zoom = Math.min(1.1, (h * 0.82) / BODY_H, (w * 0.92) / SINGLE_SCENE_W);
    rf.setViewport({ x: w / 2, y: h / 2, zoom });
  }, [rf]);

  /* Frame once on mount, then RE-frame whenever the visible viewport settles
     or the device rotates — but only while the user hasn't taken the camera.
     iOS Safari's toolbar collapses/expands *after* mount, changing the h-dvh
     container height, so a one-shot frame lands the figure off-center there;
     Android resolves the height stably at first paint, so on Android this
     fires once at mount and every later call is a harmless no-op. */
  useEffect(() => {
    frameInitial();
    let raf = 0;
    const refit = () => {
      cancelAnimationFrame(raf);
      // Coalesce the iOS toolbar-animation resize storm into one re-frame.
      raf = requestAnimationFrame(() => {
        if (!userAdjustedRef.current) frameInitial();
      });
    };
    const vv = window.visualViewport;
    vv?.addEventListener("resize", refit);
    window.addEventListener("orientationchange", refit);
    // Fallback for browsers without visualViewport.
    if (!vv) window.addEventListener("resize", refit);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", refit);
      window.removeEventListener("orientationchange", refit);
      if (!vv) window.removeEventListener("resize", refit);
    };
  }, [frameInitial]);

  /* iOS-only: while a drag or placement owns the canvas, block Safari's
     page-level pinch (gesturestart/gesturechange) — a stray second finger
     would otherwise zoom the *page*, shifting visualViewport and poisoning
     every screen→flow conversion until it resets. Scoped to active
     interactions so idle page pinch-zoom (a deliberate WCAG 1.4.4 affordance,
     see app/layout.tsx) stays available. WebKit-only events, feature-gated;
     non-passive so preventDefault takes. */
  useEffect(() => {
    if (!("ongesturestart" in window)) return;
    const el = wrapperRef.current;
    if (!el) return;
    const block = (e: Event) => {
      if (liftInfoRef.current) e.preventDefault();
    };
    el.addEventListener("gesturestart", block, { passive: false });
    el.addEventListener("gesturechange", block, { passive: false });
    return () => {
      el.removeEventListener("gesturestart", block);
      el.removeEventListener("gesturechange", block);
    };
  }, []);

  /* ——— view: which surface is shown. One body is drawn (front OR back);
         parts on the other surface rest in the side lanes. Authoritative +
         persisted (MapDoc.view); flipping animates the cards between the
         point and the lane. ——— */
  const [view, setView] = useState<Depth>("front");
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  // Transient per-part position override while a flip animates — the nodes
  // memo reads it ahead of the derived position so the shown surface's
  // cards glide to their points as the hidden ones slide to the lanes.
  const [viewAnim, setViewAnim] = useState<Map<string, XYPosition> | null>(
    null,
  );
  const viewAnimRafRef = useRef(0);
  const glideRafRef = useRef(0);
  /** Glide the camera to a viewport with an easeOutCubic tween; reduced
   *  motion jumps straight there. One glide at a time — a new call (or a
   *  fresh grab) takes the camera over. */
  const glideViewport = useCallback(
    (to: Viewport, D = 380) => {
      // Any glide (Front/Back pill, list reveal, frame-map) is the user
      // steering the camera — stand the auto-re-frame down.
      userAdjustedRef.current = true;
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
  /* A real source event means the user grabbed the canvas (pan/pinch/zoom) —
     programmatic setViewport (our framing/glides) passes null. Once they've
     taken the camera, the auto-re-frame stands down. */
  const onMoveStart = useCallback((e: unknown) => {
    if (e) userAdjustedRef.current = true;
  }, []);

  /** Flip the shown surface: every on-body card glides between its point on
   *  the body and its parked spot in the side lane (reduced motion jumps).
   *  The camera doesn't move — the body stays centered, only the cards
   *  travel. A re-flip mid-glide restarts cleanly. */
  const flipView = useCallback((next: Depth) => {
    const prev = viewRef.current;
    if (next === prev) return;
    const scale = bodyScaleRef.current;
    const from = derivePositions(partsRef.current, scale, prev);
    const to = derivePositions(partsRef.current, scale, next);
    const movers = partsRef.current.filter(
      (p) => !p.offBody && from.get(p.id) && to.get(p.id),
    );
    cancelAnimationFrame(viewAnimRafRef.current);
    setView(next);
    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced || movers.length === 0) {
      setViewAnim(null);
      return;
    }
    // Seed at the FROM positions so the flip render doesn't snap to the
    // destination before the first animation frame.
    const seed = new Map<string, XYPosition>();
    for (const p of movers) seed.set(p.id, from.get(p.id)!);
    setViewAnim(seed);
    const D = 360;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / D);
      const e = easeInOutCubic(t);
      const m = new Map<string, XYPosition>();
      for (const p of movers) {
        const a = from.get(p.id)!;
        const b = to.get(p.id)!;
        m.set(p.id, { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e });
      }
      setViewAnim(t < 1 ? m : null);
      if (t < 1) viewAnimRafRef.current = requestAnimationFrame(step);
    };
    viewAnimRafRef.current = requestAnimationFrame(step);
  }, []);

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
      // Reveal a hidden-surface part by first flipping to its side.
      const surface = partSurface(p);
      if (!p.offBody && surface !== viewRef.current) flipView(surface);
      const shown = p.offBody ? viewRef.current : surface;
      const pos = p.offBody
        ? p.freePos
        : derivePositions(partsRef.current, bodyScaleRef.current, shown).get(id);
      if (!pos) return;
      const vp = rf.getViewport();
      // Come no closer than a readable zoom; never zoom out to do it.
      const zoom = Math.max(vp.zoom, 0.8);
      glideViewport({
        x: el.clientWidth / 2 - pos.x * zoom,
        y: el.clientHeight / 2 - pos.y * zoom,
        zoom,
      });
      setReveal({ id, key: noticeKey() });
    },
    [rf, glideViewport, flipView],
  );

  /** Frame the whole map: the single body plus its park lanes and any
   *  off-body strays — the app's "home"/reset view on every screen size
   *  (an optional parts array lets a just-committed import frame itself
   *  before the ref catches up). */
  const fitAll = useCallback(
    (partsArr?: Part[]) => {
      const el = wrapperRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const s = bodyScaleRef.current;
      const list = partsArr ?? partsRef.current;
      // The single body + its side park lanes scale linearly about flow 0,0.
      let minX = (-SINGLE_SCENE_W * s) / 2;
      let maxX = (SINGLE_SCENE_W * s) / 2;
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

  // Advance (or end) the tour when the current step's real-world action
  // has actually happened — never on a timer. A state machine over time
  // (each step's "done" reads a baseline captured when it began) isn't
  // expressible as a pure per-render derivation, so an effect is the
  // right tool here, not a lint dodge. Lives below fitAll/revealPart
  // because the between-step choreography drives them.
  useEffect(() => {
    if (tourStep === null) return;
    const baseline = tourBaselineRef.current;
    const def = tourSteps[tourStep];
    if (!baseline || !def) return;
    const clearShepherd = () => {
      if (tourTimerRef.current !== null) {
        clearTimeout(tourTimerRef.current);
        tourTimerRef.current = null;
      }
    };
    if (def.done(tourSnapshot, baseline)) {
      clearShepherd();
      if (tourStep + 1 >= tourSteps.length) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTourStep(null);
        setTourMode(null);
        tourBaselineRef.current = null;
        // Calm completion: frame the whole map, a soft accent wash, a
        // gentle buzz — then the space is theirs.
        fitAll();
        haptic(12);
        // The wash only mounts when motion is allowed — setting the key under
        // reduced motion would leave it stuck (its reset is the wash's own
        // animationend).
        if (!reducedMotion) setTourDoneKey(Date.now());
        setNotice({ text: "That's the tour — this space is yours", key: noticeKey(), ttlMs: 6000 });
      } else {
        // Auto-choreography between steps: for the place steps, frame the
        // WHOLE stage (fresh card AND the body it's headed for — centering
        // just the card pushed the body off a narrow screen) and glow the
        // card; put the list AND its options page away before the frame
        // step so its callout isn't buried under the sheet; scroll the
        // link step's connect field into view once the edit sheet's slide
        // settles (it can sit below the fold on short screens).
        const nextId = tourSteps[tourStep + 1].id;
        if (
          (nextId === "place" || nextId === "place2") &&
          tourSnapshot.lastAddedId
        ) {
          fitAll();
          setReveal({ id: tourSnapshot.lastAddedId, key: noticeKey() });
        }
        if (nextId === "frame") {
          setListOpen(false);
          setExportMenuOpen(false);
        }
        if (nextId === "link") {
          window.setTimeout(() => {
            // Scroll ONLY the edit sheet's own scroller — scrollIntoView
            // walks every scrollable ancestor, and the parked bottom
            // sheets (translated below the h-dvh stage) give the document
            // scroll range: it dragged the whole page down and left every
            // sheet marooned mid-screen from this step onward.
            const field = document.querySelector<HTMLElement>(
              '[data-tour="connect"]',
            );
            const scroller = field?.closest<HTMLElement>(".overflow-y-auto");
            if (!field || !scroller) return;
            const f = field.getBoundingClientRect();
            const s = scroller.getBoundingClientRect();
            scroller.scrollBy({
              top: f.top - s.top - (s.height - f.height) / 2,
              behavior: reducedMotion ? "auto" : "smooth",
            });
          }, 450);
        }
        tourBaselineRef.current = tourSnapshot;
        setTourStep(tourStep + 1);
      }
      return;
    }
    /* Locked phone flow only below: regression + shepherding. */
    if (tourMode !== "phone") return;
    if (def.regress?.(tourSnapshot, baseline)) {
      // The step's action came undone (the create sheet was dismissed
      // without naming) — step back and re-baseline so forward works.
      clearShepherd();
      tourBaselineRef.current = tourSnapshot;
      setTourStep(Math.max(0, tourStep - 1));
      return;
    }
    if (lift) {
      // Mid-drag any pending auto-select is stale (the card may land
      // somewhere new, or off the body) — drop it; the next settle
      // re-schedules.
      clearShepherd();
      return;
    }
    if (def.id === "place" || def.id === "place2") {
      if (
        tourSnapshot.selectedId !== null &&
        tourSnapshot.onBodyCount === baseline.onBodyCount
      ) {
        // Keep-clear backstop: a selection before the landing would bury
        // the drag target under the edit sheet, whose dismissal this step
        // doesn't allow (onNodesChange suppresses these at the source).
        setSelectedId(null);
        return;
      }
      if (
        tourSnapshot.onBodyCount > baseline.onBodyCount &&
        tourSnapshot.selectedId === null &&
        tourTimerRef.current === null
      ) {
        // The landing is down — once the settle glide and landing pop
        // finish, open the editor (the tour-only exception to the
        // no-auto-select-on-phone rule). Re-verified at fire time: the
        // step may have changed, or the card may have been dragged off
        // the body again.
        const stepAtSchedule = tourStep;
        const targetId = tourSnapshot.lastAddedId;
        tourTimerRef.current = window.setTimeout(() => {
          tourTimerRef.current = null;
          if (tourStepRef.current !== stepAtSchedule) return;
          const part = partsRef.current.find((p) => p.id === targetId);
          if (!part || part.offBody) return;
          // Programmatic selection bypasses the one-sheet-at-a-time policy
          // in the RF select handlers — enforce it here too.
          setListOpen(false);
          setPhoneSheet(null);
          setSelectedId(targetId);
        }, 620);
      }
      return;
    }
    if (
      def.id === "link" &&
      tourSnapshot.selectedId === null &&
      tourTimerRef.current === null
    ) {
      // The link step needs its edit sheet up — recover a stray deselect
      // (Escape, mostly) by quietly reselecting the second part.
      const stepAtSchedule = tourStep;
      const targetId = tourSnapshot.lastAddedId;
      tourTimerRef.current = window.setTimeout(() => {
        tourTimerRef.current = null;
        if (tourStepRef.current !== stepAtSchedule) return;
        if (!targetId || !partsRef.current.some((p) => p.id === targetId))
          return;
        // Same one-sheet policy as the RF select handlers (see above).
        setListOpen(false);
        setPhoneSheet(null);
        setSelectedId(targetId);
      }, 400);
    }
  }, [tourStep, tourSteps, tourMode, tourSnapshot, lift, fitAll, reducedMotion, setSelectedId]);
  // Unmount safety for the shepherd timer.
  useEffect(
    () => () => {
      if (tourTimerRef.current !== null) clearTimeout(tourTimerRef.current);
    },
    [],
  );

  useEffect(
    () => () => {
      cancelAnimationFrame(liftRafRef.current);
      cancelAnimationFrame(settleRafRef.current);
      cancelAnimationFrame(scaleRafRef.current);
      cancelAnimationFrame(restoreRafRef.current);
      cancelAnimationFrame(glideRafRef.current);
      cancelAnimationFrame(viewAnimRafRef.current);
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
    haptic(4); // confirm tick — undo is a rescue, it should answer the hand
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
    setNotice({ text: `Undid — ${snap.label}`, key: noticeKey() });
    setCanUndo(historyRef.current.length > 0);
    setUndoLabel(historyRef.current[historyRef.current.length - 1]?.label ?? null);
    setCanRedo(true);
    setRedoLabel(snap.label);
  }, [cancelSettle, setSelectedId, setSelectedEdgeId]);

  /** Re-apply the last undone change. Symmetric with undo: banks the current
   *  (pre-redo) state onto history so the redo can itself be undone. */
  const redo = useCallback(() => {
    const snap = redoRef.current.pop();
    if (!snap) return;
    haptic(4); // same confirm tick as undo
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
    setNotice({ text: `Redid — ${snap.label}`, key: noticeKey() });
    setCanRedo(redoRef.current.length > 0);
    setRedoLabel(redoRef.current[redoRef.current.length - 1]?.label ?? null);
    setCanUndo(true);
    setUndoLabel(snap.label);
  }, [cancelSettle, markDirty, setSelectedId, setSelectedEdgeId]);

  const settleTween = useCallback(
    (
      id: string,
      from: XYPosition,
      to: XYPosition,
      opts?: {
        /** Lift/tilt state at release — relaxed to rest over the glide. */
        putDown?: { lag: number; theta: number; liftAmt: number };
        /** Landing effects (pop, ripple, haptic) — touchdown only. */
        onLand?: () => void;
      },
    ) => {
      cancelSettle();
      if (
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false
      ) {
        // Land instantly at the anchor — no glide, no put-down relax —
        // but the touchdown effects (pop, ripple, haptic) still fire,
        // same as they would at the end of a normal glide.
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
      // The single body is centered at flow 0, whose screen position is
      // (vp0.x, vp0.y) at every zoom — hold it while the zoom compensates
      // 1/scale, so the body keeps its screen size as it rescales.
      if (
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false
      ) {
        setBodyScale(to);
        if (phone) rf.setViewport({ x: vp0.x, y: vp0.y, zoom: z0 * (from / to) });
        return;
      }
      const start = performance.now();
      const D = 650;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / D);
        const s = from + (to - from) * easeInOutCubic(t);
        setBodyScale(s);
        if (phone) rf.setViewport({ x: vp0.x, y: vp0.y, zoom: z0 * (from / s) });
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

      // Nearest anchor on the shown surface; over the body but outside
      // every capture radius, stay magnetic to it. This resolution runs
      // every frame — transit or aim — so a release always lands on the
      // truth under the hand.
      const res = resolveMagnet(steer, scale, viewRef.current);
      let near = res.near;
      let hit = res.hit;
      const snapR = res.snapR;
      // The touch offset can push the steer point past the extremities
      // (crown, feet); if it misses but the card itself is on the body,
      // target from the card instead of falling into off-body mode.
      if (!hit && info.isTouch) {
        const over = overBody(card, scale);
        const nc = nearestTarget(card, scale, viewRef.current);
        if (nc && (nc.dist < snapR || over)) {
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
            hapticTick(aim, 4); // the grip hands over — a soft tick
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
        hapticTick(aim, 3);
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
        follow.near = overBody(
          steer,
          scale,
          follow.near ? FOLLOW_EXIT_PAD : FOLLOW_ENTER_PAD,
        );
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
      // Grabbing a part is engaging with the map — the follow-camera will
      // move the viewport, so the auto-re-frame must not fire under it.
      userAdjustedRef.current = true;
      // ——— off-body GROUP drag ———
      // A multi-selection whose every member is off-body drags natively
      // as a group: RF moves the whole selection itself, so NONE of the
      // single-node lift/magnet choreography below may run (it's all
      // keyed on one id). Positions stream through onNodesChange into
      // the multiDrag map; onNodeDragStop persists them in one pass.
      {
        const sel = selectedIdsRef.current;
        if (
          sel.size > 1 &&
          sel.has(node.id) &&
          [...sel].every(
            (id) => partsRef.current.find((p) => p.id === id)?.offBody,
          )
        ) {
          cancelAnimationFrame(restoreRafRef.current);
          cancelAnimationFrame(glideRafRef.current);
          const session: ReadonlySet<string> = new Set(sel);
          multiDragRef.current = session;
          // RF can abort a drag without firing onNodeDragStop (deletion,
          // pinch second-touch) — same teardown insurance as the lift.
          const relief = () => {
            window.removeEventListener("pointerup", relief, true);
            window.removeEventListener("touchend", relief, true);
            window.removeEventListener("touchcancel", relief, true);
            setTimeout(() => {
              if (multiDragRef.current === session) {
                multiDragRef.current = null;
                setMultiDrag(null);
              }
            }, 400);
          };
          window.addEventListener("pointerup", relief, true);
          window.addEventListener("touchend", relief, true);
          window.addEventListener("touchcancel", relief, true);
          haptic(6);
          setSelectedEdgeId(null);
          return;
        }
      }
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
          const { near, hit } = resolveMagnet(node.position, scale, viewRef.current);
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
      haptic(6);
      // A drag takes over the stage: close any open phone sheet so it
      // can't cover the landing or resurface when the drag ends.
      setPhoneSheet(null);
      setLift({ id: node.id, isTouch });
      setSelectedEdgeId(null);
      startLiftLoop();
    },
    [rf, startLiftLoop, cancelSettle, setSelectedEdgeId],
  );

  const onNodeDrag = useCallback((e: MouseEvent | TouchEvent, node: Node) => {
    // The loop owns cardPosRef (cursor-centering) — RF's grab-offset
    // position is only the blend source until centering completes.
    rfPosRef.current = node.position;
    const client = eventClient(e);
    if (client) pointerScreenRef.current = client;
  }, []);

  const onNodeDragStop = useCallback(
    (_e: MouseEvent | TouchEvent, _node: Node, draggedNodes: Node[]) => {
      // ——— off-body group drag: persist every member in one pass ———
      const group = multiDragRef.current;
      if (group) {
        multiDragRef.current = null;
        const scale = bodyScaleRef.current;
        const moved = draggedNodes.filter((n) => group.has(n.id));
        if (moved.length) {
          pushHistory(
            "move-multi",
            `moved ${moved.length} part${moved.length === 1 ? "" : "s"}`,
          );
          const posById = new Map(moved.map((n) => [n.id, n.position]));
          setParts((ps) =>
            ps.map((p) => {
              const pos = posById.get(p.id);
              return pos
                ? {
                    ...p,
                    offBody: true,
                    freePos: { ...pos },
                    location: nearestOffZone(pos, scale),
                    depth: "front" as const,
                  }
                : p;
            }),
          );
          haptic(6);
          autoArmedRef.current = true;
        }
        // Same batch as setParts — the cards re-derive from freePos at
        // the exact positions the override map held, no flash.
        setMultiDrag(null);
        return;
      }
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
        const to = derivePositions(updated, bodyScaleRef.current, viewRef.current).get(info.id);
        if (to) {
          settleTween(info.id, dropPos, to, {
            putDown,
            onLand: () => {
              const now = Date.now();
              setDropPop({ id: info.id, key: now });
              setRipple({ pos: to, key: now });
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
    const selects: { id: string; selected: boolean }[] = [];
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
    const multiMoves: [string, XYPosition][] = [];
    for (const ch of changes) {
      if (ch.type === "position" && ch.position) {
        if (multiDragRef.current?.has(ch.id)) {
          // Off-body group drag: RF moves every selected card; fold the
          // whole batch into one map update below. The final
          // dragging:false changes are deliberately ignored — they must
          // not fall through to the keyboard-nudge commit, which would
          // magnet-resolve each card; onNodeDragStop persists the group.
          if (ch.dragging) multiMoves.push([ch.id, ch.position]);
        } else if (liftInfoRef.current?.id === ch.id) {
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
          const { near, hit } = resolveMagnet(pos, scale, viewRef.current);
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
        // The locked tour's place steps own selection (see
        // tourSuppressSelectRef) — drop selects, keep deselects.
        if (!(ch.selected && tourSuppressSelectRef.current)) {
          selects.push({ id: ch.id, selected: ch.selected });
          if (ch.selected) {
            maybeShowLinkHint();
            // One sheet at a time on phones: selecting a card summons the
            // edit sheet, so the list and any create/share/more sheet step
            // aside first.
            if (isPhoneRef.current) {
              setListOpen(false);
              setPhoneSheet(null);
            }
          }
        }
      } else if (ch.type === "remove") {
        removed.push(ch.id);
      }
    }
    if (multiMoves.length) {
      setMultiDrag((prev) => {
        const next = new Map(prev);
        for (const [id, pos] of multiMoves) next.set(id, pos);
        return next;
      });
    }
    // A marquee (de)selects several nodes in one change batch — fold them
    // into ONE set update so intermediate states never render.
    if (selects.length) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const s of selects) {
          if (s.selected) next.add(s.id);
          else next.delete(s.id);
        }
        return next.size === prev.size && [...next].every((id) => prev.has(id))
          ? prev
          : next;
      });
    }
    // Group delete (marquee + Delete key) is ONE mutation: one history
    // snapshot, one parts/arrows pass — not N stacked undo entries.
    if (removed.length) {
      const gone = new Set(removed);
      const firstName = partsRef.current.find((p) => p.id === removed[0])?.name;
      pushHistory(
        removed.length === 1 ? `delete:${removed[0]}` : "delete-multi",
        removed.length === 1
          ? firstName
            ? `deleted “${firstName}”`
            : "delete"
          : `deleted ${removed.length} parts`,
      );
      setParts((ps) => ps.filter((p) => !gone.has(p.id)));
      setArrows((as) =>
        as.filter((a) => !gone.has(a.sourceId) && !gone.has(a.targetId)),
      );
      setSelectedIds((prev) => {
        if (![...prev].some((id) => gone.has(id))) return prev;
        const next = new Set(prev);
        for (const id of removed) next.delete(id);
        return next;
      });
      // Removals free up room — let auto-space ease the body back.
      autoArmedRef.current = true;
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
    const selects: { id: string; selected: boolean }[] = [];
    const removed: string[] = [];
    for (const ch of changes) {
      if (ch.type === "select") {
        selects.push({ id: ch.id, selected: ch.selected });
        // One sheet at a time on phones: selecting an arrow summons its
        // edit sheet, so the list and any create/share/more sheet step
        // aside first.
        if (ch.selected && isPhoneRef.current) {
          setListOpen(false);
          setPhoneSheet(null);
        }
      } else if (ch.type === "remove") {
        removed.push(ch.id);
      }
    }
    if (selects.length) {
      setSelectedEdgeIds((prev) => {
        const next = new Set(prev);
        for (const s of selects) {
          if (s.selected) next.add(s.id);
          else next.delete(s.id);
        }
        return next.size === prev.size && [...next].every((id) => prev.has(id))
          ? prev
          : next;
      });
    }
    // One snapshot per delete batch (see onNodesChange). When this is the
    // edge half of a node-delete cascade, pushHistory's same-tick dedupe
    // merges it with the node push into a single undo entry.
    if (removed.length) {
      const gone = new Set(removed);
      pushHistory(
        removed.length === 1 ? `arrow-delete:${removed[0]}` : "arrow-delete-multi",
        removed.length === 1 ? "arrow removed" : `removed ${removed.length} arrows`,
      );
      setArrows((as) => as.filter((a) => !gone.has(a.id)));
      setSelectedEdgeIds((prev) => {
        if (![...prev].some((id) => gone.has(id))) return prev;
        const next = new Set(prev);
        for (const id of removed) next.delete(id);
        return next;
      });
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
          color: ARROW_INK,
          // The specific dot dragged from, so the edge can exit from that
          // fixed side instead of recomputing one from geometry alone (see
          // FloatingEdge). The target has no equivalent — see the Arrow
          // type's comment.
          sourceHandle: conn.sourceHandle as HandleSide | undefined,
        },
      ]);
      haptic(6); // creating a relationship buzzes like creating a part
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
        setSelectedIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        // Removals free up room — let auto-space ease the body back.
        autoArmedRef.current = true;
      },
      duplicatePart: (id) => {
        const src = partsRef.current.find((p) => p.id === id);
        if (!src) return;
        const scale = bodyScaleRef.current;
        // Clone as a free-floating copy offset from where the original
        // currently renders, so it never stacks on the same anchor.
        const from =
          derivePositions(partsRef.current, scale, viewRef.current).get(id) ??
          src.freePos;
        const pos = { x: from.x + 30, y: from.y + 30 };
        const cid = newId("part");
        pushHistory(`add:${cid}`, `duplicated “${src.name}”`);
        const clone: Part = {
          ...src,
          id: cid,
          offBody: true,
          depth: "front",
          freePos: pos,
          location: nearestOffZone(pos, scale),
          locked: undefined, // a fresh copy starts unlocked, ready to drag
        };
        setParts((ps) => [...ps, clone]);
        // The newest part is now the clone — tour steps and anything else
        // anchoring to "the most recently added card" must follow it.
        setLastAddedId(cid);
        autoArmedRef.current = true;
        // Desktop: select the copy so its toolbar appears. Phone: the sheet
        // closes on duplicate, so a notice confirms the copy landed.
        if (isPhoneRef.current) {
          setNotice({ text: `Duplicated “${src.name}”`, key: noticeKey() });
        } else {
          setSelectedId(cid);
        }
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
        const from = derivePositions(partsRef.current, scale, viewRef.current).get(id);
        const to = derivePositions(updated, scale, viewRef.current).get(id);
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
        const from = derivePositions(partsRef.current, scale, viewRef.current).get(id);
        const to = derivePositions(updated, scale, viewRef.current).get(id);
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
          const to = derivePositions(updated, bodyScaleRef.current, viewRef.current).get(id);
          if (to) settleTween(id, center, to);
          else setDragOverride(null);
        }
        autoArmedRef.current = true;
      },
      updateArrow: (id, patch) => {
        // A deleted arrow's label field flushes on unmount — that flush
        // must not push a junk history entry for a ghost arrow.
        if (!arrowsRef.current.some((a) => a.id === id)) return;
        pushHistory(
          `arrow-edit:${id}:${Object.keys(patch).join(",")}`,
          "label" in patch ? "arrow label" : "arrow style",
        );
        setArrows((as) =>
          as.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        );
      },
      connectParts: (sourceId, targetId) => {
        if (!sourceId || !targetId || sourceId === targetId) return false;
        // No sourceHandle: a keyboard/menu link has no dragged-from dot, so
        // FloatingEdge falls back to its dynamic geometry on both ends.
        // Skip an exact duplicate so the picker can't silently stack a
        // second identical arrow the user can't tell apart.
        if (
          arrowsRef.current.some(
            (a) => a.sourceId === sourceId && a.targetId === targetId,
          )
        ) {
          return false;
        }
        pushHistory("arrow-add", "arrow");
        setArrows((as) => [
          ...as,
          {
            id: newId("arrow"),
            sourceId,
            targetId,
            color: ARROW_INK,
          },
        ]);
        haptic(6); // creating a relationship buzzes like creating a part
        return true;
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
        setSelectedEdgeIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
      selectArrow: (id) => {
        setSelectedEdgeId(id);
      },
      registerPartInner: (id, el) => {
        if (el) innerElsRef.current.set(id, el);
        else innerElsRef.current.delete(id);
      },
      noticeBlockedDrag: (id, reason) => {
        const p = partsRef.current.find((q) => q.id === id);
        if (!p) return;
        haptic(3); // refusal tick — same register as the other put-downs
        setNotice(
          reason === "multi"
            ? {
                // Fires only for mixed/on-body multi-selections — an
                // all-off-body selection drags together (groupDrag).
                text: "On-body parts move one at a time — this group can't move together",
                key: noticeKey(),
              }
            : p.locked
              ? {
                  text: "Locked — unlock it in its editor to move it",
                  key: noticeKey(),
                }
              : {
                  text: `It's on the ${partSurface(p)} — flip the view to move it`,
                  key: noticeKey(),
                },
        );
      },
    }),
    [rf, settleTween, pushHistory, setSelectedId, setSelectedEdgeId],
  );

  /* ——— creation: spawn onto the staging shelf below the body ——— */

  /** Add: create the part immediately as a free-floating (off-body) card on
   *  a staging shelf just below the figure's feet — the same fanned grid the
   *  import fallback uses — then the person drags it up onto the body (full
   *  lift/magnet/settle choreography). This replaces the old center-spawn,
   *  which dropped cards at ±edgeX right on top of the hidden surface's
   *  parked cards and stacked them at the torso midline. The shelf fans
   *  across three columns (no stacking) and is clear of the side park lanes;
   *  a gentle reveal-glide keeps it on-screen when it lands out of view. */
  const spawnCountRef = useRef(0);
  const spawnPart = useCallback(
    (name: string) => {
      const scale = bodyScaleRef.current;
      const el = wrapperRef.current;
      const vp = rf.getViewport();
      const zoom = vp.zoom || 1;
      const cw = el?.clientWidth ?? 0;
      const ch = el?.clientHeight ?? 0;
      // Wrap the shelf index so a long run of adds cycles across the same
      // few rows instead of marching off down the canvas forever.
      const pos = freeSpawnGrid(spawnCountRef.current++ % 12, scale);

      const id = newId("part");
      pushHistory(`add:${id}`, `added “${name}”`);
      const part: Part = {
        id,
        name,
        color: PALETTE[colorCountRef.current++ % PALETTE.length],
        fontSize: "m",
        bold: false,
        shape: "rounded",
        location: nearestOffZone(pos, scale),
        depth: "front",
        offBody: true,
        freePos: pos,
      };
      setParts((ps) => [...ps, part]);
      autoArmedRef.current = true;
      haptic(6);

      // Keep the shelf on-screen: if the fresh card falls outside the
      // current viewport, glide (keeping the current zoom) so it rests
      // comfortably in the lower third — but never reframe when it's
      // already visible, which would read as a jarring jump.
      const halfW = (part.w ?? 160) / 2 + 30;
      const halfH = (part.h ?? 48) / 2 + 30;
      const inView =
        cw > 0 &&
        ch > 0 &&
        pos.x - halfW >= (0 - vp.x) / zoom &&
        pos.x + halfW <= (cw - vp.x) / zoom &&
        pos.y - halfH >= (0 - vp.y) / zoom &&
        pos.y + halfH <= (ch - vp.y) / zoom;
      if (!inView && cw > 0 && ch > 0) {
        glideViewport({
          x: cw / 2 - pos.x * zoom,
          y: ch * 0.62 - pos.y * zoom,
          zoom,
        });
      }

      setLastAddedId(id);

      // Desktop: select so the new toolbar is ready. Phone: stay hands-off
      // (the edit sheet would bury it) and nudge the person to drag it —
      // unless the tour is running, whose "place" step owns that
      // instruction (two competing texts at once read as noise).
      if (isPhoneRef.current) {
        if (tourStep === null) {
          setNotice({
            text: `Added “${name}” — drag it onto the body`,
            key: noticeKey(),
          });
        }
      } else if (tourStep === null) {
        // During onboarding, let the person tap the new card themselves so
        // the "open its editor" step stays performable — auto-select would
        // satisfy it instantly and skip the callout.
        setSelectedId(id);
      }
    },
    [rf, pushHistory, glideViewport, tourStep, setSelectedId],
  );

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
      setLastAddedId(newParts[newParts.length - 1].id);
      autoArmedRef.current = true;
      const n = newParts.length;
      setNotice({
        text:
          freeCount > 0
            ? `Imported ${n} part${n === 1 ? "" : "s"} · ${freeCount} in free space`
            : `Imported ${n} part${n === 1 ? "" : "s"}`,
        key: noticeKey(),
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
      view: viewRef.current,
      viewport: rf.getViewport(),
    });
    dirtyRef.current = false;
    setSaveStatus("saved");
    // The map now lives in a file; the reload-recovery draft has done its
    // job and would otherwise resurface as a stale "restore?" next visit.
    clearDraft();
    setNotice({ text: "Saved ✓", key: noticeKey() });
  }, [parts, arrows, bodyScale, autoScale, rf]);

  /** The toolbar's primary Save now exports a PNG snapshot of the map
   *  (JSON save/load moved into the parts-list ⋯ menu). Async: only the
   *  real download flashes the "Saved image ✓" confirmation. */
  const onSaveImage = useCallback(async () => {
    const ok = await downloadMapPng(parts, arrows, bodyScale, viewRef.current);
    setNotice({
      text: ok ? "Saved image ✓" : "Couldn't save the image.",
      key: noticeKey(),
    });
  }, [parts, arrows, bodyScale]);

  /** Reset — clear the whole map to a blank canvas. Undoable (Ctrl/Cmd+Z
   *  or the notice's Undo), so it snapshots first rather than routing
   *  through applyLoadedDoc (which wipes history). Confirmed by the caller
   *  (the account/options popover), so this just does the clear. */
  const resetMap = useCallback(() => {
    if (partsRef.current.length === 0 && arrowsRef.current.length === 0) return;
    pushHistory("reset", "cleared the map");
    setParts([]);
    setArrows([]);
    setSelectedId(null);
    setSelectedEdgeId(null);
    // A cleared shelf starts fresh at its top-left slot again.
    spawnCountRef.current = 0;
    setNotice({
      text: "Cleared the map",
      key: noticeKey(),
      action: { label: "Undo", run: undo },
    });
  }, [pushHistory, undo, setSelectedId, setSelectedEdgeId]);

  /** The reset choreography shared by every "replace the whole map" path
   *  — file load and opening a cloud map alike. */
  const applyLoadedDoc = useCallback(
    (doc: MapDoc) => {
      cancelAnimationFrame(settleRafRef.current);
      cancelAnimationFrame(scaleRafRef.current);
      cancelAnimationFrame(restoreRafRef.current);
      cancelAnimationFrame(viewAnimRafRef.current);
      settlingRef.current = false;
      setDragOverride(null);
      setViewAnim(null);
      setParts(doc.parts);
      setArrows(doc.arrows);
      setBodyScale(doc.bodyScale);
      manualScaleRef.current = doc.bodyScale;
      setAutoScale(doc.autoScale);
      setView(doc.view ?? "front");
      setSelectedId(null);
      setSelectedEdgeId(null);
      // A loaded map owns its own camera (saved viewport, or wherever it
      // currently sits) — the initial auto-re-frame must not override it.
      userAdjustedRef.current = true;
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
    [rf, setSelectedId, setSelectedEdgeId],
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
      view: viewRef.current,
      viewport: rf.getViewport(),
    };
    setSaveStatus("saving");
    setNotice({ text: "Saving to your maps…", key: noticeKey() });
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
        // A name given via the top-bar rename survives the first cloud
        // save; only the "Untitled map" placeholder gets the dated one.
        const title =
          mapTitle.trim() && mapTitle !== "Untitled map"
            ? mapTitle
            : `Parts Map – ${new Date().toISOString().slice(0, 10)}`;
        const created = await createMap(title, doc);
        cloudDocRef.current = { id: created.id, title: created.title };
        setMapTitle(created.title);
      }
      dirtyRef.current = false;
      setSaveStatus("saved");
      clearDraft();
      setNotice({ text: "Saved to your maps ✓", key: noticeKey() });
    } catch (e) {
      // Still unsaved — let the indicator and next debounce reflect that.
      setSaveStatus("dirty");
      setNotice({
        text: e instanceof CloudError ? e.message : "Couldn't save to your maps.",
        key: noticeKey(),
      });
    } finally {
      cloudSavingRef.current = false;
    }
  }, [parts, arrows, bodyScale, autoScale, rf, mapTitle]);
  const onOpenCloudMap = useCallback(
    (id: string, title: string, doc: MapDoc) => {
      applyLoadedDoc(doc);
      cloudDocRef.current = { id, title };
      setMapTitle(title);
      setNotice({ text: `Opened “${title}”`, key: noticeKey() });
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
        setMapTitle(file.name.replace(/\.json$/i, "").trim() || "Untitled map");
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
          key: noticeKey(),
        });
      }
    },
    [applyLoadedDoc],
  );

  /** Phone top-bar home / title: signed-in people go to their maps,
   *  signed-out people to sign-in (where cloud maps live). */
  const goHome = useCallback(() => {
    if (session) setMyMapsOpen(true);
    else window.location.href = "/sign-in";
  }, [session]);

  /** Open one phone sheet, closing the list and any card selection first
   *  (one sheet at a time). */
  const openPhoneSheet = useCallback(
    (which: "create" | "share" | "more" | "rename") => {
      setSelectedId(null);
      setListOpen(false);
      setPhoneSheet(which);
    },
    [setSelectedId],
  );

  /** Rename the open map from the top-bar title. Cloud maps rename in
   *  place (same seam as My Maps); otherwise the title is display-only
   *  state — it isn't part of MapDoc, so this never marks the map dirty. */
  const commitMapRename = useCallback(
    async (raw: string) => {
      const title = raw.trim();
      if (!title || title === mapTitle) return;
      setMapTitle(title);
      if (!cloudDocRef.current) return;
      const id = cloudDocRef.current.id;
      try {
        await updateMap(id, { title });
        cloudDocRef.current = { id, title };
      } catch (e) {
        setNotice({
          text:
            e instanceof CloudError ? e.message : "Couldn't rename the map.",
          key: noticeKey(),
        });
      }
    },
    [mapTitle],
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
      view: viewRef.current,
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

  // Device prefs (settings popover): scroll behavior + minimap. Same
  // read-once hydration-safe pattern as the draft flag above.
  const [scrollPan, setScrollPanState] = useState(false);
  const [minimapOn, setMinimapState] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScrollPanState(getScrollPan());
    setMinimapState(getMinimap());
  }, []);
  const onScrollPan = useCallback((on: boolean) => {
    setScrollPan(on);
    setScrollPanState(on);
  }, []);
  const onMinimap = useCallback((on: boolean) => {
    setMinimap(on);
    setMinimapState(on);
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
        key: noticeKey(),
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
      key: noticeKey(),
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
      // The locked tour swallows hardware undo/redo — a Ctrl+Z would
      // silently unwind the very placement the step just taught. Escape
      // stays live below: its consequences (sheet close, deselect) are
      // absorbed by the tour's regress / auto-reselect rules by design.
      if (tourLockedRef.current && mod && (key === "z" || key === "y")) {
        e.preventDefault();
        return;
      }
      // Redo: Ctrl/Cmd+Shift+Z or Ctrl+Y. Checked first so Shift+Z doesn't
      // fall through to undo.
      if (mod && ((e.shiftKey && key === "z") || key === "y")) {
        if (typing || liftInfoRef.current) return;
        e.preventDefault();
        redo();
        return;
      }
      if (mod && !e.shiftKey && key === "z") {
        // Fields keep their own text undo; mid-drag the map is in the hand,
        // not on the table.
        if (typing || liftInfoRef.current) return;
        e.preventDefault();
        undo();
        return;
      }
      if (typing) return;
      if (e.key === "Escape") {
        // Whichever overlay is on top closes first — modals, then phone
        // sheets (create/share/more, then the list), then selection. The
        // desktop docked list stays: it's persistent chrome, not an overlay.
        if (shortcutsOpen) setShortcutsOpen(false);
        else if (importOpen) setImportOpen(false);
        else if (myMapsOpen) setMyMapsOpen(false);
        else if (welcomeOpen) setWelcomeOpen(false);
        else if (phoneSheet) setPhoneSheet(null);
        else if (listOpen && isPhoneRef.current) setListOpen(false);
        else {
          setSelectedEdgeId(null);
          setSelectedId(null);
        }
        return;
      }
      // "?" opens the shortcuts card (desktop; needs a keyboard anyway).
      if (e.key === "?" && !isPhoneRef.current && !liftInfoRef.current) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
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
  }, [undo, redo, importOpen, myMapsOpen, welcomeOpen, phoneSheet, listOpen, selectedId, shortcutsOpen, setSelectedId, setSelectedEdgeId]);


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
    // The locked phone tour owns the stage: a mid-tour rescale would slide
    // the spotlighted card out from under its ring, and the pill's Undo is
    // tappable through the lock. Skip (armed state survives) — the pass
    // resumes on the first mutation after the tour.
    if (tourLockedRef.current) return;
    const timer = setTimeout(() => {
      if (
        !autoArmedRef.current ||
        liftInfoRef.current ||
        settlingRef.current ||
        tourLockedRef.current
      ) {
        return;
      }
      autoArmedRef.current = false;
      const onBody = partsRef.current.filter((p) => {
        const r = REGION_BY_KEY[p.location];
        // Only the shown surface's cards are on the body; parked ones (in
        // the side lanes) don't count toward crowding.
        return (
          !p.offBody && r && !r.offBody && partSurface(p) === viewRef.current
        );
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
            key: noticeKey(),
            action: { label: "Undo", run: () => animateBodyScale(cur) },
            ttlMs: 8000,
          });
        }
        return;
      }
      const posMap = derivePositions(partsRef.current, cur, viewRef.current);
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
            key: noticeKey(),
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
    const posMap = derivePositions(parts, bodyScale, view);
    // A multi-selection drags as a GROUP only when every member is
    // off-body — free cards have no anchors to be text-authoritative
    // about. Any on-body/locked member keeps the marquee select-only.
    const groupDrag =
      selectedIds.size > 1 &&
      [...selectedIds].every((id) => {
        const p = parts.find((q) => q.id === id);
        return !!p && p.offBody && !p.locked;
      });
    return parts.map((p) => {
      const md = measuredDims.get(p.id);
      // On-body but on the hidden surface → resting in a side lane.
      const parked = !p.offBody && partSurface(p) !== view;
      return {
        id: p.id,
        type: "part" as const,
        // A drag override wins; else the group drag's transient position;
        // else the flip animation's; else the derived (view-aware) one.
        position:
          dragOverride?.id === p.id
            ? dragOverride.pos
            : multiDrag?.get(p.id) ??
              viewAnim?.get(p.id) ??
              posMap.get(p.id)!,
        // Locked cards can't be dragged or key-deleted (they stay selectable
        // so the lock can be toggled off; the toolbar's explicit confirm-
        // delete calls api.deletePart directly and still works). Parked
        // cards don't drag either — flip to their side to move them. A
        // multi-selected card drags only when the whole selection is an
        // off-body group (groupDrag): on-body positions are text-
        // authoritative and the lift/magnet choreography is single-node
        // by construction, so mixed selections stay select-only.
        // Dragging an UNselected card collapses the selection to it first
        // (RF's selectNodesOnDrag), so single drags are never blocked.
        draggable:
          !p.locked &&
          !parked &&
          !(selectedIds.size > 1 && selectedIds.has(p.id) && !groupDrag),
        deletable: !p.locked,
        width: p.w,
        height: p.h,
        // Echo RF's own measurement back so adoptUserNodes doesn't wipe it
        // on every rebuild of these fresh node objects (RF error #015).
        measured: md ? { width: md.w, height: md.h } : undefined,
        selected: selectedIds.has(p.id),
        // The only accessible-name a screen reader gets for this card —
        // previously just whatever text happened to be inside it, so
        // location/note/surface never reached assistive tech at all.
        ariaLabel: `${p.name} — ${locationDisplay(p)}${p.note ? ", has a note" : ""}`,
        data: {
          part: p,
          lifted: lift?.id === p.id,
          popKey: dropPop?.id === p.id ? dropPop.key : 0,
          revealKey: reveal?.id === p.id ? reveal.key : 0,
          parked,
          // The edit popover only appears for a lone selection — a marquee
          // catching five cards must not open five toolbars.
          solo: selectedIds.size <= 1,
          // The whole selection drags together (off-body group) — the
          // card's refusal probe must not fire for these.
          groupDrag,
        },
      };
    });
  }, [
    parts,
    bodyScale,
    view,
    viewAnim,
    dragOverride,
    multiDrag,
    selectedIds,
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
        selected: selectedEdgeIds.has(a.id),
        // Arrows are black-only now (the per-arrow color picker was
        // removed); a.color is kept in the model for save-file round-trip
        // but no longer drives the render.
        data: {
          label: a.label,
          sourceHandle: a.sourceHandle,
          // The arrow popover opens only for a lone arrow selection (a
          // marquee auto-selects edges between caught nodes — those must
          // not each open a popover).
          solo: selectedEdgeIds.size === 1 && selectedIds.size === 0,
        },
        style: { stroke: ARROW_INK, strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: ARROW_INK,
          width: 16,
          height: 16,
        },
      })),
    [arrows, selectedEdgeIds, selectedIds],
  );

  /** True while any phone overlay owns the stage — the floating notice
   *  pill holds back so text never covers a sheet. Notice state + TTL keep
   *  running, so a notice that outlives the sheet still appears once the
   *  sheet closes (natural deferral, no queue). Mirrors the sheets' own
   *  open conditions. */
  const phoneOverlayUp =
    isPhone &&
    (phoneSheet !== null ||
      listOpen ||
      importOpen ||
      myMapsOpen ||
      (!lift && (selectedId !== null || selectedEdgeId !== null)));

  return (
    <AppApiContext.Provider value={api}>
     <PartsListContext.Provider value={parts}>
     <ArrowsListContext.Provider value={arrows}>
      <div
        ref={wrapperRef}
        // overflow-hidden + clip: the parked bottom sheets (translateY
        // just below the stage) otherwise hand the DOCUMENT scroll range,
        // and any focus/scrollIntoView can wedge the whole app mid-scroll.
        // `clip` (where supported) also makes the wrapper itself
        // un-scrollable programmatically; `hidden` is the fallback.
        className="relative h-dvh w-full overflow-hidden"
        style={{ background: "var(--canvas)", overflow: "clip" }}
        // Android long-press pops the OS context menu mid-card-grab.
        // Suppress it on the canvas and its cards/edges only — text
        // fields (sheets, popovers) keep their paste menus.
        onContextMenu={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("input,textarea,select,[contenteditable='true']"))
            return;
          if (t.closest(".react-flow__pane, .react-flow__node, .react-flow__edge"))
            e.preventDefault();
        }}
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
          onMoveStart={onMoveStart}
          onPaneClick={() => {
            setSelectedId(null);
            setSelectedEdgeId(null);
            // On phone every sheet sits over the canvas — a tap on the
            // map means "let me see it."
            if (isPhoneRef.current) {
              setListOpen(false);
              setPhoneSheet(null);
            }
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
          // Desktop: Ctrl/Cmd+click adds/removes a card from the selection
          // (the selectedIds reducer already accumulates RF's select
          // changes). Phone keeps taps single-select.
          multiSelectionKeyCode={isPhone ? null : ["Control", "Meta"]}
          // Desktop is pointer-first (Miro web): bare left-drag on empty
          // canvas draws a marquee; hold Space (RF's default
          // panActivationKeyCode) or middle/right-drag to pan. Phones keep
          // one-finger-pan untouched.
          panOnDrag={isPhone ? true : DESKTOP_PAN_BUTTONS}
          selectionOnDrag={!isPhone && !tourLocked}
          selectionMode={SelectionMode.Partial}
          // The locked tour's guard gates pointers; these two close the
          // hardware side: Delete could strand the link step below two
          // parts (the delete BUTTON is denied, the key wasn't), and a
          // scroll wheel would zoom the stage out from under a spotlight.
          deleteKeyCode={tourLocked ? null : ["Backspace", "Delete"]}
          zoomOnScroll={!tourLocked}
          // Settings pref (desktop): wheel pans, Ctrl/Cmd+wheel zooms
          // (RF's zoomActivationKeyCode default), trackpad pinch still
          // zooms. When off, the wheel zooms as before.
          panOnScroll={!isPhone && scrollPan && !tourLocked}
          // The floating frame-map button owns the bottom-right corner.
          attributionPosition="bottom-left"
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
              <BodyOutline bodyScale={bodyScale} view={view} />
              <AnchorConstellation
                bodyScale={bodyScale}
                view={view}
                visible={!!lift}
                boost={false}
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
              touch={lift?.isTouch ?? false}
              leaderRef={leaderRef}
              indicatorRef={indicatorRef}
              ringRef={ringRef}
            />
          </ViewportPortal>
          {/* Settings-gated minimap (desktop): stacks above the zoom pill;
              cards paint in their own colors, warm-paper mask. */}
          {!isPhone && minimapOn && (
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              aria-label="Map overview"
              className="mb-14!"
              bgColor="#ffffff"
              maskColor="rgba(247,245,241,0.85)"
              nodeColor={(n) => (n.data as { part: Part }).part.color}
              nodeStrokeColor="rgba(58,55,51,0.15)"
            />
          )}
        </ReactFlow>

        {/* Front/Back toggle: flips which surface the single body shows —
            the hidden surface's cards glide out to the side lanes. Both
            layouts; sits below the top bar / toolbar. */}
        <div
          data-ui-chrome
          className="absolute left-1/2 top-[calc(4rem+env(safe-area-inset-top))] z-20 flex -translate-x-1/2 gap-0.5 rounded-full p-1"
          // Shared surface: phone keeps the frosted pill; desktop matches
          // the solid Miro-clean chrome.
          style={{ ...(isPhone ? panelStyle : cardStyle), touchAction: "manipulation" }}
        >
          {(["front", "back"] as const).map((d) => (
            <button
              key={d}
              aria-label={`Show the ${d} of the body`}
              aria-pressed={view === d}
              className="rounded-full px-3.5 py-1 text-[11px] uppercase tracking-[0.12em] transition-colors active:bg-black/10 pointer-coarse:min-h-11"
              style={
                view === d
                  ? { background: "var(--accent)", color: "#fff" }
                  : { color: "var(--ink-soft)" }
              }
              onClick={() => {
                // The flip moves every card; give it the same buzz a drop
                // gets. Only on a real change — and only here, not inside
                // flipView, whose system-initiated calls (reveal) stay
                // silent.
                if (view !== d) haptic(6);
                flipView(d);
              }}
            >
              {d}
            </button>
          ))}
        </div>
        <Toolbar
          onAdd={spawnPart}
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
          scrollPan={scrollPan}
          onScrollPan={onScrollPan}
          minimapOn={minimapOn}
          onMinimap={onMinimap}
          onSaveImage={onSaveImage}
          onClearMap={resetMap}
          listOpen={listOpen}
          onToggleList={() => setListOpen((v) => !v)}
          onShowWelcome={reopenWelcome}
          onShowShortcuts={() => setShortcutsOpen(true)}
          onOpenMyMaps={() => setMyMapsOpen(true)}
          onSaveToCloud={saveToCloud}
          draftEnabled={draftEnabled}
          onToggleDraft={toggleDraft}
          canUndo={canUndo}
          canRedo={canRedo}
          undoLabel={undoLabel}
          redoLabel={redoLabel}
          onUndo={undo}
          onRedo={redo}
        />
        {/* ——— Phone chrome (Miro-style): top identity/nav bar + bottom
            quick-tools pill. Both `sm:hidden`; desktop keeps the Toolbar
            above. ——— */}
        <PhoneTopBar
          mapTitle={mapTitle}
          onHome={goHome}
          onTitle={() => openPhoneSheet("rename")}
          onSearch={() => {
            setSelectedId(null);
            setPhoneSheet(null);
            setListSearchFocus(true);
            setListOpen(true);
          }}
          onShare={() => openPhoneSheet("share")}
          onMore={() => openPhoneSheet("more")}
        />
        <PhoneQuickTools
          canUndo={canUndo}
          canRedo={canRedo}
          undoLabel={undoLabel}
          redoLabel={redoLabel}
          onUndo={undo}
          onRedo={redo}
          listOpen={listOpen}
          onToggleList={() => {
            setPhoneSheet(null);
            setListSearchFocus(false);
            setListOpen((v) => !v);
          }}
          onAdd={() => openPhoneSheet("create")}
        />
        <FrameMapButton
          onFrame={() => {
            fitAll();
            setFramedTick((t) => t + 1);
          }}
        />
        {/* Desktop viewport pill (fit / − / % / +) — the frame button
            above serves phones; each hides where the other shows. */}
        <ZoomPill
          onFit={() => {
            fitAll();
            setFramedTick((t) => t + 1);
          }}
        />
        {/* Parts list — a docked side panel on desktop, a bottom sheet on
            phones (hidden while dragging, like the edit sheet). */}
        {isPhone ? (
          <PhonePartsSheet
            parts={parts}
            arrows={arrows}
            bodyScale={bodyScale}
            view={view}
            open={listOpen && !lift}
            autoFocusSearch={listSearchFocus}
            onReveal={revealPart}
            onClose={() => {
              setListOpen(false);
              setListSearchFocus(false);
            }}
            onExportMenuOpenChange={setExportMenuOpen}
          />
        ) : (
          <PartsListPanel
            parts={parts}
            arrows={arrows}
            bodyScale={bodyScale}
            view={view}
            open={listOpen}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReveal={revealPart}
            onClose={() => setListOpen(false)}
            onExportMenuOpenChange={setExportMenuOpen}
            onNotice={(text) => setNotice({ text, key: noticeKey() })}
            onSaveJson={onSave}
            onLoadJson={onLoad}
            dirty={saveStatus === "dirty"}
          />
        )}
        {/* Phone card editor — bottom sheet; hides while dragging so it
            never covers a landing. */}
        <MobileEditSheet
          part={parts.find((p) => p.id === selectedId) ?? null}
          open={
            isPhone &&
            !!selectedId &&
            parts.some((p) => p.id === selectedId) &&
            !lift
          }
          onClose={() => setSelectedId(null)}
        />
        {/* Phone arrow editor — bottom sheet; the floating popover stays a
            desktop affordance. Hidden while dragging, like the others. */}
        <ArrowEditSheet
          arrow={arrows.find((a) => a.id === selectedEdgeId) ?? null}
          open={isPhone && !!selectedEdgeId && !lift}
          onClose={() => setSelectedEdgeId(null)}
        />
        {/* Phone create / share / more sheets (Miro-style). Gated off during
            a drag so they never cover a landing. */}
        <CreateSheet
          open={phoneSheet === "create" && !lift}
          onClose={() => setPhoneSheet(null)}
          nameValue={draft}
          onNameChange={setDraft}
          onAdd={(name) => {
            setPhoneSheet(null);
            spawnPart(name);
            setDraft("");
          }}
          onImport={() => {
            setPhoneSheet(null);
            setImportOpen(true);
          }}
          onLoadSample={() => {
            setPhoneSheet(null);
            applyLoadedDoc(sampleMap());
            setMapTitle("Sample map");
          }}
        />
        <ShareSheet
          open={phoneSheet === "share" && !lift}
          onClose={() => setPhoneSheet(null)}
          parts={parts}
          arrows={arrows}
          bodyScale={bodyScale}
          view={view}
          onSaveToCloud={saveToCloud}
          onSaveFile={onSave}
          onLoadFile={onLoad}
          onOpenMyMaps={() => setMyMapsOpen(true)}
        />
        <MoreSheet
          open={phoneSheet === "more" && !lift}
          onClose={() => setPhoneSheet(null)}
          bodyScale={bodyScale}
          onBodyScale={onBodyScaleManual}
          autoScale={autoScale}
          onAutoScale={(v) => {
            setAutoScale(v);
            markDirty();
          }}
          draftEnabled={draftEnabled}
          onToggleDraft={toggleDraft}
          onShowWelcome={reopenWelcome}
          onClearMap={resetMap}
        />
        <RenameSheet
          open={phoneSheet === "rename" && !lift}
          onClose={() => setPhoneSheet(null)}
          title={mapTitle}
          onCommit={commitMapRename}
        />
        {/* Quiet notice pill: what just happened, sometimes one action.
            Never shown while a phone sheet/page is up (text must not cover
            UI — in-sheet outcomes speak inline on their rows instead); the
            state keeps ticking so it can still appear after the sheet
            closes. Renders after the sheets so it paints above them when
            it does show. */}
        {notice && !phoneOverlayUp && (
          <div
            key={notice.key}
            data-ui-chrome
            data-tour-allow
            role="status"
            // Desktop clamps its width (readable floor, never wide enough to
            // reach the zoom pill / minimap) and, while the list panel is
            // docked open, re-centers over the visible canvas instead of the
            // whole window so it can't sit on the panel.
            className={`fade-in absolute bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-2xl py-1.5 pl-4 pr-1.5 ${
              isPhone
                ? "left-1/2"
                : `sm:bottom-6 sm:max-w-[clamp(12rem,calc(100vw-520px),28rem)] ${
                    listOpen ? "left-[calc(50%+138px)]" : "left-1/2"
                  }`
            }`}
            style={{ ...(isPhone ? panelStyle : cardStyle), touchAction: "manipulation" }}
            onClick={() => setNotice(null)}
          >
            <span
              className="max-w-[min(78vw,26rem)] text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {notice.text}
            </span>
            {notice.action ? (
              <button
                className="rounded-full px-2.5 py-1 text-[11px] pointer-coarse:min-h-9"
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
            view: viewRef.current,
            viewport: rf.getViewport(),
          })}
          isDirty={() => dirtyRef.current}
          onOpenMap={onOpenCloudMap}
        />
        {/* Sits below the Front/Back toggle band (which ends ~108px+inset
            on coarse, ~99px on desktop) — text must never touch chrome. */}
        {parts.length === 0 && (
          <div
            className={`fade-in pointer-events-none absolute inset-x-0 top-[calc(8rem+env(safe-area-inset-top))] z-10 flex justify-center px-6 text-center ${isPhone ? "" : "sm:top-28"}`}
          >
            <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
              {isPhone
                ? "Tap + to add a part, then drag it onto the body."
                : "Add a part, then drag it onto the body."}
            </p>
          </div>
        )}
        <ShortcutsModal
          open={shortcutsOpen}
          onClose={() => setShortcutsOpen(false)}
          scrollPan={scrollPan}
        />
        <WelcomeModal
          open={welcomeOpen}
          onClose={closeWelcome}
          onStartTour={() => startTour()}
          onExplore={() => {
            // Load the example AND guide through it — the tour's steps
            // measure changes against a baseline, so it works the same on
            // a populated map. The baseline must come from the doc itself:
            // the refs startTour reads still hold the pre-load map in this
            // tick.
            const doc = sampleMap();
            applyLoadedDoc(doc);
            setMapTitle("Sample map");
            startTour({
              parts: doc.parts.length,
              arrows: doc.arrows.length,
              onBody: doc.parts.filter((p) => !p.offBody).length,
            });
          }}
        />
        {/* Hidden while the wrong surface covers its anchor — see
            tourVisible above. */}
        {tourVisible && (
          <CoachMarks
            steps={tourSteps}
            step={tourStep!}
            snapshot={tourSnapshot}
            onSkip={skipTour}
            nudgeKey={tourNudge}
          />
        )}
        {/* One-shot soft accent wash as the tour completes — a calm
            celebration, not confetti. Skipped under reduced motion. */}
        {tourDoneKey !== null && !reducedMotion && (
          <div
            // String-namespaced: this and the notice pill are keyed
            // siblings — bare numbers from different sources must never
            // be able to collide here again.
            key={`wash-${tourDoneKey}`}
            aria-hidden
            className="tour-done pointer-events-none absolute inset-0 z-30"
            onAnimationEnd={() => setTourDoneKey(null)}
          />
        )}
      </div>
     </ArrowsListContext.Provider>
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
