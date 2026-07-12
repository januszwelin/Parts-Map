"use client";

/* ════════════════════════════════════════════════════════════════════
   TOOLBAR — add/import/save-image/body-scale chrome, plus the
   floating frame-map button. (JSON save/load live in the parts-list ⋯
   menu; the primary Save button exports a PNG image.)
   ════════════════════════════════════════════════════════════════════ */

import React, { useEffect, useRef, useState } from "react";
import { MIN_SCALE, MAX_SCALE } from "@/lib/tuning";
import { cardStyle, panelStyle } from "@/lib/ui";
import { authClient } from "@/lib/auth-client";
import { useIsPhone } from "@/hooks/use-media";

/** Curved arrow — mirrored for redo. The only visible Undo/Redo affordance
 *  in the app; Ctrl/Cmd+Z has no equivalent on a touchscreen. */
function UndoIcon({ mirrored }: { mirrored?: boolean }) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block", transform: mirrored ? "scaleX(-1)" : undefined }}
      aria-hidden
    >
      <path d="M7 8 3 12l4 4" />
      <path d="M3 12h11a6 6 0 0 1 0 12h-2" />
    </svg>
  );
}

/** Shared frame for the toolbar's quiet 16px line icons (Miro-style:
 *  icon-only buttons, words live in the tooltip). */
function IconSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block" }}
      aria-hidden
    >
      {children}
    </svg>
  );
}

function ListIcon() {
  return (
    <IconSvg>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M6 2.5v11" />
    </IconSvg>
  );
}

function ImportIcon() {
  return (
    <IconSvg>
      <path d="M8 2v7.5M5 6.5 8 9.5l3-3" />
      <path d="M2.5 10.5v2A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </IconSvg>
  );
}

function ImageIcon() {
  return (
    <IconSvg>
      <rect x="2" y="3" width="12" height="10" rx="2" />
      <circle cx="5.6" cy="6.4" r="1" />
      <path d="M13.8 10.6 10.6 7.4l-5.4 5.4" />
    </IconSvg>
  );
}

/** Sliders glyph — reads as "adjustments," which is what the settings
 *  menu holds (body size, auto-space, scroll, minimap, draft). */
function SettingsIcon() {
  return (
    <IconSvg>
      <path d="M2.5 5.5h11M2.5 10.5h11" />
      <circle cx="6" cy="5.5" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10.5" r="1.7" fill="currentColor" stroke="none" />
    </IconSvg>
  );
}

/** Quiet settings-row switch: whole row is the control, sage track when
 *  on. Used for every boolean in the settings popover. */
function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  title,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  title?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      title={title}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-black/5"
      style={{ color: "var(--ink-soft)" }}
      onClick={() => onChange(!checked)}
    >
      <span className="min-w-0">
        {label}
        {hint ? (
          <span className="block text-[10px] leading-4" style={{ color: "var(--ink-faint)" }}>
            {hint}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className="relative h-4 w-7 shrink-0 rounded-full transition-colors"
        style={{ background: checked ? "var(--accent)" : "var(--line)" }}
      >
        <span
          className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform motion-reduce:transition-none"
          style={{
            transform: checked ? "translateX(12px)" : "translateX(0)",
            boxShadow: "0 1px 2px rgba(60,50,40,0.2)",
          }}
        />
      </span>
    </button>
  );
}

export function Toolbar(props: {
  onAdd: (name: string) => void;
  /** The name field's text lives in the parent (shared with the phone
   *  Create sheet), so it's cleared centrally after an add. */
  nameValue: string;
  onNameChange: (v: string) => void;
  onImportOpen: () => void;
  bodyScale: number;
  onBodyScale: (v: number) => void;
  autoScale: boolean;
  onAutoScale: (v: boolean) => void;
  /** The primary Save button now exports the map as a PNG image; JSON
   *  save/load moved into the parts-list ⋯ menu. */
  onSaveImage: () => void;
  /** Clear the whole map (undoable) — lives in the account/options popover. */
  onClearMap: () => void;
  listOpen: boolean;
  onToggleList: () => void;
  onShowWelcome: () => void;
  /** Opens the keyboard-shortcuts card (also on the "?" key). */
  onShowShortcuts: () => void;
  onOpenMyMaps: () => void;
  onSaveToCloud: () => void;
  /** Opt-in local draft (keeps work across an accidental tab-close). */
  draftEnabled: boolean;
  onToggleDraft: (on: boolean) => void;
  /** Device prefs (settings popover): wheel pans instead of zooming, and
   *  the minimap. Persisted in localStorage (lib/prefs), not in the map. */
  scrollPan: boolean;
  onScrollPan: (on: boolean) => void;
  minimapOn: boolean;
  onMinimap: (on: boolean) => void;
  /** Visible Undo/Redo — Ctrl/Cmd+Z has no touchscreen equivalent, so this
   *  is the only way to undo a mis-tap on phone. Labels name the action
   *  that would be undone/redone, when known. */
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isPhone = useIsPhone();
  const { data: session } = authClient.useSession();
  const deleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    // BetterAuth's client resolves with { error } instead of throwing —
    // reloading unconditionally would tell the person their account was
    // deleted when it wasn't (e.g. a stale session needing a fresh
    // sign-in). Only a confirmed success reloads.
    const { error } = await authClient.deleteUser();
    if (error) {
      setDeleting(false);
      setDeleteError(
        error.message ?? "Couldn't delete — sign in again and retry.",
      );
      return;
    }
    window.location.reload();
  };
  const submit = () => {
    const n = props.nameValue.trim();
    if (!n) return;
    props.onAdd(n);
    props.onNameChange("");
  };
  const closePopovers = () => {
    setAccountOpen(false);
    setSettingsOpen(false);
    setHelpOpen(false);
    setConfirmDelete(false);
    setConfirmClear(false);
    setDeleteError(null);
  };
  // Click-outside via a document listener — a `fixed inset-0` catcher
  // here would be trapped by the toolbar pill's backdrop-filter (it makes
  // this a containing block), so it never covered the canvas. Escape
  // stays for keyboard/switch users.
  const accountRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const anyPopoverOpen = accountOpen || settingsOpen || helpOpen;
  useEffect(() => {
    if (!anyPopoverOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (
        !accountRef.current?.contains(t) &&
        !settingsRef.current?.contains(t) &&
        !helpRef.current?.contains(t)
      )
        closePopovers();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closePopovers();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [anyPopoverOpen]);
  const btn =
    "rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:bg-black/5 pointer-coarse:min-h-10";
  /** Miro-style icon button: quiet glyph, the word lives in the tooltip. */
  const iconBtn =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-black/5 disabled:opacity-30";

  return (
    // Classic top bar — desktop / wide layouts only. Phones get the
    // Miro-style top bar + bottom quick-tools pill + sheets instead
    // (rendered separately in parts-map-app). CSS-hidden below `sm` AND
    // JS-hidden whenever useIsPhone says phone: a landscape phone is
    // ≥640px wide, so the breakpoint alone would paint this desktop bar
    // over the phone dialect (useIsPhone starts false, so first paint
    // still matches the SSR markup).
    <div
      data-ui-chrome
      className={`pointer-events-none absolute inset-x-0 top-0 z-20 hidden justify-center p-3 ${isPhone ? "" : "sm:flex"}`}
    >
      <div
        className="pointer-events-auto relative flex w-auto max-w-full select-none flex-nowrap items-center justify-center gap-x-1.5 rounded-xl px-2.5 py-1.5"
        style={{ ...cardStyle, touchAction: "manipulation" }}
      >
        <button
          data-tour="list"
          aria-label="Parts list"
          title="Parts list"
          className={iconBtn}
          style={{
            color: "var(--ink-soft)",
            background: props.listOpen ? "rgba(0,0,0,0.05)" : undefined,
          }}
          onClick={() => {
            closePopovers();
            props.onToggleList();
          }}
        >
          <ListIcon />
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            aria-label={
              props.undoLabel ? `Undo — ${props.undoLabel}` : "Undo"
            }
            title={`${props.undoLabel ? `Undo — ${props.undoLabel}` : "Undo"} (Ctrl+Z)`}
            disabled={!props.canUndo}
            className={iconBtn}
            style={{ color: "var(--ink-soft)" }}
            onClick={() => {
              closePopovers();
              props.onUndo();
            }}
          >
            <UndoIcon />
          </button>
          <button
            aria-label={
              props.redoLabel ? `Redo — ${props.redoLabel}` : "Redo"
            }
            title={`${props.redoLabel ? `Redo — ${props.redoLabel}` : "Redo"} (Ctrl+Y)`}
            disabled={!props.canRedo}
            className={iconBtn}
            style={{ color: "var(--ink-soft)" }}
            onClick={() => {
              closePopovers();
              props.onRedo();
            }}
          >
            <UndoIcon mirrored />
          </button>
        </div>
        <div className="h-5 w-px shrink-0" style={{ background: "var(--line)" }} />
        <input
          className="w-44 min-w-24 shrink rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{
            background: "#fff",
            border: "1px solid var(--line)",
          }}
          placeholder="Name a part…"
          enterKeyHint="go"
          value={props.nameValue}
          onChange={(e) => props.onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button
          data-tour="add"
          title="Add a part (Enter)"
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)" }}
          onClick={submit}
        >
          Add
        </button>
        <button
          aria-label="Import parts"
          title="Import parts — paste a list, one per line"
          className={iconBtn}
          style={{ color: "var(--ink-soft)" }}
          onClick={props.onImportOpen}
        >
          <ImportIcon />
        </button>
        <div className="h-5 w-px shrink-0" style={{ background: "var(--line)" }} />
        <button
          aria-label="Save image"
          title="Save the map as an image (PNG). JSON save/load live in the list ⋯ menu."
          className={iconBtn}
          style={{ color: "var(--ink-soft)" }}
          onClick={props.onSaveImage}
        >
          <ImageIcon />
        </button>
        <div className="relative shrink-0" ref={settingsRef}>
          <button
            aria-label="Settings"
            aria-haspopup="menu"
            aria-expanded={settingsOpen}
            title="Settings"
            className={iconBtn}
            style={{
              color: "var(--ink-soft)",
              background: settingsOpen ? "rgba(0,0,0,0.05)" : undefined,
            }}
            onClick={() => {
              const next = !settingsOpen;
              closePopovers();
              setSettingsOpen(next);
            }}
          >
            <SettingsIcon />
          </button>
          {settingsOpen && (
            <div
              className="fade-in absolute right-0 top-full z-20 mt-1 w-64 rounded-xl p-1.5"
              style={cardStyle}
            >
              <div className="px-3 pb-2 pt-2">
                <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  Body size
                </span>
                <input
                  type="range"
                  min={MIN_SCALE}
                  max={MAX_SCALE}
                  step={0.01}
                  value={props.bodyScale}
                  onChange={(e) => props.onBodyScale(Number(e.target.value))}
                  className="mt-1.5 w-full"
                  aria-label="Body size"
                />
              </div>
              <SwitchRow
                label="Auto-space"
                hint="Gently make room when parts crowd"
                checked={props.autoScale}
                onChange={props.onAutoScale}
              />
              <div className="my-1 h-px" style={{ background: "var(--line)" }} />
              <SwitchRow
                label="Scroll pans the canvas"
                hint="Ctrl+scroll zooms"
                checked={props.scrollPan}
                onChange={props.onScrollPan}
              />
              <SwitchRow
                label="Show minimap"
                checked={props.minimapOn}
                onChange={props.onMinimap}
              />
              <div className="my-1 h-px" style={{ background: "var(--line)" }} />
              <SwitchRow
                label="Local draft"
                hint="Keep a private copy on this device"
                title="Keep a private copy on this device so a tab-close can't lose work"
                checked={props.draftEnabled}
                onChange={props.onToggleDraft}
              />
            </div>
          )}
        </div>
        <div className="relative shrink-0" ref={helpRef}>
          <button
            className={iconBtn}
            style={{
              color: "var(--ink-soft)",
              background: helpOpen ? "rgba(0,0,0,0.05)" : undefined,
            }}
            aria-label="Help"
            aria-haspopup="menu"
            aria-expanded={helpOpen}
            title="Help"
            onClick={() => {
              const next = !helpOpen;
              closePopovers();
              setHelpOpen(next);
            }}
          >
            ?
          </button>
          {helpOpen && (
            <div
              className="fade-in absolute right-0 top-full z-20 mt-1 w-48 rounded-xl p-1.5"
              style={cardStyle}
              role="menu"
            >
              <button
                role="menuitem"
                className="w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-black/5"
                style={{ color: "var(--ink-soft)" }}
                onClick={() => {
                  closePopovers();
                  props.onShowWelcome();
                }}
              >
                Welcome &amp; tour
              </button>
              <button
                role="menuitem"
                className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-xs hover:bg-black/5"
                style={{ color: "var(--ink-soft)" }}
                onClick={() => {
                  closePopovers();
                  props.onShowShortcuts();
                }}
              >
                Keyboard shortcuts
                <span style={{ color: "var(--ink-faint)" }}>?</span>
              </button>
            </div>
          )}
        </div>
        {session ? (
          <div className="relative hidden shrink-0 sm:block" ref={accountRef}>
            <button
              aria-label="Account"
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium text-white"
              style={{ background: "var(--accent)" }}
              onClick={() => setAccountOpen((v) => !v)}
            >
              {(session.user.name || session.user.email || "?")
                .trim()
                .charAt(0)
                .toUpperCase()}
            </button>
            {accountOpen && (
              <div
                className="fade-in absolute right-0 top-full z-20 mt-1 w-44 rounded-xl p-1.5"
                style={cardStyle}
              >
                <button
                  className="w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-black/5"
                  style={{ color: "var(--ink-soft)" }}
                  onClick={() => {
                    setAccountOpen(false);
                    props.onOpenMyMaps();
                  }}
                >
                  My maps
                </button>
                <button
                  className="w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-black/5"
                  style={{ color: "var(--ink-soft)" }}
                  onClick={() => {
                    setAccountOpen(false);
                    props.onSaveToCloud();
                  }}
                >
                  Save to cloud
                </button>
                <button
                  className="w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-black/5"
                  style={{ color: "var(--ink-soft)" }}
                  onClick={() => {
                    setAccountOpen(false);
                    authClient.signOut();
                  }}
                >
                  Sign out
                </button>
                <div className="my-1 h-px" style={{ background: "var(--line)" }} />
                {confirmClear ? (
                  <div className="px-2 py-1">
                    <p className="pb-1.5 text-[11px]" style={{ color: "var(--ink-soft)" }}>
                      Clear the whole map? You can undo this.
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        className="flex-1 rounded-md px-2 py-1 text-[11px]"
                        style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
                        onClick={() => {
                          closePopovers();
                          props.onClearMap();
                        }}
                      >
                        Clear
                      </button>
                      <button
                        className="flex-1 rounded-md px-2 py-1 text-[11px]"
                        style={{ color: "var(--ink-soft)" }}
                        onClick={() => setConfirmClear(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-black/5"
                    style={{ color: "var(--ink-soft)" }}
                    onClick={() => setConfirmClear(true)}
                  >
                    Clear map
                  </button>
                )}
                <div className="my-1 h-px" style={{ background: "var(--line)" }} />
                {confirmDelete ? (
                  <div className="px-2 py-1">
                    <p className="pb-1.5 text-[11px]" style={{ color: "var(--ink-soft)" }}>
                      Delete your account and all cloud maps?
                    </p>
                    {deleteError && (
                      <p className="pb-1.5 text-[11px]" style={{ color: "var(--danger)" }}>
                        {deleteError}
                      </p>
                    )}
                    <div className="flex gap-1.5">
                      <button
                        className="flex-1 rounded-md px-2 py-1 text-[11px] disabled:opacity-60"
                        style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
                        disabled={deleting}
                        onClick={deleteAccount}
                      >
                        {deleting ? "Deleting…" : "Delete"}
                      </button>
                      <button
                        className="flex-1 rounded-md px-2 py-1 text-[11px]"
                        style={{ color: "var(--ink-soft)" }}
                        disabled={deleting}
                        onClick={() => {
                          setConfirmDelete(false);
                          setDeleteError(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-black/5"
                    style={{ color: "var(--danger)" }}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete account
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <a
            href="/sign-in"
            className={`${btn} hidden shrink-0 sm:block`}
            style={{ color: "var(--ink-soft)" }}
          >
            Sign in
          </a>
        )}
      </div>
    </div>
  );
}

/** The way home on PHONES: the canvas is endless and easy to get lost
 *  in, so frame-map is a standalone floating button, big enough to hit
 *  without looking. Desktop gets the ZoomPill (zoom-pill.tsx) in the
 *  same corner instead — its fit button carries the visible
 *  [data-tour="frame"] anchor there. */
export function FrameMapButton({ onFrame }: { onFrame: () => void }) {
  // Landscape phones are ≥640px wide: CSS-hidden at `sm` for real
  // desktops, un-hidden by JS whenever useIsPhone says phone (inverse of
  // the top Toolbar's pattern; useIsPhone starts false so first paint
  // matches the SSR markup).
  const isPhone = useIsPhone();
  return (
    <button
      data-ui-chrome
      data-tour="frame"
      aria-label="Frame the map"
      title="Frame the map"
      // panelStyle's inline background beats hover:/active:bg — the press
      // reads as a small scale dip instead (the hover wash was already
      // dead for the same reason).
      className={`absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] z-20 flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95 motion-reduce:active:scale-100 ${isPhone ? "" : "sm:hidden"}`}
      style={{ ...panelStyle, touchAction: "manipulation" }}
      onClick={onFrame}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 16 16"
        fill="none"
        stroke="var(--ink-soft)"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M5.5 1.5H3A1.5 1.5 0 0 0 1.5 3v2.5" />
        <path d="M10.5 1.5H13A1.5 1.5 0 0 1 14.5 3v2.5" />
        <path d="M5.5 14.5H3A1.5 1.5 0 0 1 1.5 13v-2.5" />
        <path d="M10.5 14.5H13a1.5 1.5 0 0 0 1.5-1.5v-2.5" />
      </svg>
    </button>
  );
}
