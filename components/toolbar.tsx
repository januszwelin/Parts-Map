"use client";

/* ════════════════════════════════════════════════════════════════════
   TOOLBAR — add/import/save-image/body-scale chrome, plus the
   floating frame-map button. (JSON save/load live in the parts-list ⋯
   menu; the primary Save button exports a PNG image.)
   ════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from "react";
import { MIN_SCALE, MAX_SCALE } from "@/lib/tuning";
import { panelStyle } from "@/lib/ui";
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
  onOpenMyMaps: () => void;
  onSaveToCloud: () => void;
  /** Opt-in local draft (keeps work across an accidental tab-close). */
  draftEnabled: boolean;
  onToggleDraft: (on: boolean) => void;
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
    setConfirmDelete(false);
    setConfirmClear(false);
    setDeleteError(null);
  };
  // Click-outside via a document listener — a `fixed inset-0` catcher
  // here would be trapped by the toolbar pill's backdrop-filter (it makes
  // this a containing block), so it never covered the canvas. Escape
  // stays for keyboard/switch users.
  const accountRef = useRef<HTMLDivElement>(null);
  const anyPopoverOpen = accountOpen;
  useEffect(() => {
    if (!anyPopoverOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) closePopovers();
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

  const sliderAndAuto = (
    <>
      <input
        type="range"
        min={MIN_SCALE}
        max={MAX_SCALE}
        step={0.01}
        value={props.bodyScale}
        onChange={(e) => props.onBodyScale(Number(e.target.value))}
        className="w-24 min-w-0 flex-1 sm:flex-none"
        aria-label="Body size"
      />
      <label
        className="flex cursor-pointer items-center gap-1 whitespace-nowrap text-[11px]"
        style={{ color: "var(--ink-soft)" }}
      >
        <input
          type="checkbox"
          checked={props.autoScale}
          onChange={(e) => props.onAutoScale(e.target.checked)}
          className="accent-[var(--accent)]"
        />
        auto-space
      </label>
    </>
  );

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
        className="pointer-events-auto relative flex w-auto max-w-full select-none flex-wrap items-center justify-center gap-x-2 gap-y-1.5 rounded-2xl px-3 py-2"
        style={{ ...panelStyle, touchAction: "manipulation" }}
      >
        <button
          data-tour="list"
          aria-label="Toggle parts list"
          className={`${btn} shrink-0`}
          style={{ color: "var(--ink-soft)" }}
          onClick={() => {
            closePopovers();
            props.onToggleList();
          }}
        >
          {props.listOpen ? "◂ list" : "☰ list"}
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            aria-label={
              props.undoLabel ? `Undo — ${props.undoLabel}` : "Undo"
            }
            title={props.undoLabel ? `Undo — ${props.undoLabel}` : "Undo"}
            disabled={!props.canUndo}
            className={`${btn} disabled:opacity-30`}
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
            title={props.redoLabel ? `Redo — ${props.redoLabel}` : "Redo"}
            disabled={!props.canRedo}
            className={`${btn} disabled:opacity-30`}
            style={{ color: "var(--ink-soft)" }}
            onClick={() => {
              closePopovers();
              props.onRedo();
            }}
          >
            <UndoIcon mirrored />
          </button>
        </div>
        <input
          className="w-24 min-w-0 flex-1 rounded-lg px-3 py-1.5 text-sm outline-none sm:w-44 sm:flex-none"
          style={{
            background: "rgba(255,255,255,0.75)",
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
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)" }}
          onClick={submit}
        >
          Add
        </button>

        {/* ——— desktop / wide: everything inline ——— */}
        <button
          className={`${btn} hidden sm:block`}
          style={{ color: "var(--ink-soft)" }}
          onClick={props.onImportOpen}
        >
          Import
        </button>
        <label
          className="hidden items-center gap-1.5 text-[11px] sm:flex"
          style={{ color: "var(--ink-soft)" }}
        >
          body
          <div className="flex items-center gap-2">{sliderAndAuto}</div>
        </label>
        <div className="hidden h-4 w-px sm:block" style={{ background: "var(--line)" }} />
        <button
          className={`${btn} hidden sm:block`}
          style={{ color: "var(--ink-soft)" }}
          onClick={props.onSaveImage}
          title="Save the map as an image (PNG). JSON save/load live in the list ⋯ menu."
        >
          Save image
        </button>
        <button
          className={`${btn} hidden shrink-0 sm:block`}
          style={{ color: "var(--ink-soft)" }}
          aria-label="Welcome & tour"
          title="Welcome & tour"
          onClick={props.onShowWelcome}
        >
          ?
        </button>
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
                style={panelStyle}
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
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs hover:bg-black/5"
                  style={{ color: "var(--ink-soft)" }}
                  title="Keep a private copy on this device so a tab-close can't lose work"
                >
                  <input
                    type="checkbox"
                    checked={props.draftEnabled}
                    onChange={(e) => props.onToggleDraft(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  Local draft
                </label>
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

/** The way home. The canvas is endless and easy to get lost in, so the
 *  frame-map control is a standalone floating button — always in the same
 *  corner on both layouts, big enough to hit without looking. */
export function FrameMapButton({ onFrame }: { onFrame: () => void }) {
  // Landscape phones are ≥640px wide: the `sm:` offset is for real
  // desktops only, so it yields to the phone clearance whenever
  // useIsPhone says phone (same JS-override pattern as the top bars).
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
      className={`absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] z-20 flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95 motion-reduce:active:scale-100 ${isPhone ? "" : "sm:bottom-10"}`}
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
