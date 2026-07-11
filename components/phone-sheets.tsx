"use client";

/* ════════════════════════════════════════════════════════════════════
   PHONE SHEETS — the bottom sheets reached from the phone chrome:
   • RenameSheet  (from the top-bar title) — rename the open map
   • CreateSheet  (from the + pill)        — name a part, or import / sample
   • ShareSheet   (from the top-bar share) — cloud/file save & load, exports
   • MoreSheet    (from the top-bar ⋯)      — body size, draft, account
   All built on the shared BottomSheet shell. Phone only.
   ════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from "react";
import type { Arrow, Part, Depth } from "@/lib/types";
import {
  mapText,
  shareText,
  shareFlowchartPng,
  shareMapPng,
  downloadFlowchartPng,
  downloadMapPng,
} from "@/lib/exports";
import { MIN_SCALE, MAX_SCALE } from "@/lib/tuning";
import { authClient } from "@/lib/auth-client";
import { BottomSheet } from "@/components/bottom-sheet";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden style={{ display: "block" }}>
      {d.split("|").map((seg, i) => (
        <path key={i} d={seg} />
      ))}
    </svg>
  );
}

export const PATHS = {
  import: "M12 15V3|M8 7l4-4 4 4|M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  sample: "M12 3v4|M12 17v4|M3 12h4|M17 12h4|M7 7l2.5 2.5|M14.5 14.5 17 17|M17 7l-2.5 2.5|M9.5 14.5 7 17",
  cloud: "M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1A3.5 3.5 0 0 1 17 18H7Z",
  save: "M12 3v12|M8 11l4 4 4-4|M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  load: "M12 15V3|M8 7l4-4 4 4|M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  copy: "M9 9h10v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1Z|M5 15V4a1 1 0 0 1 1-1h9",
  flow: "M9 4h6v3H9zM4 17h6v3H4zm10 0h6v3h-6zM12 7v4|M7 13v-2h10v2",
  image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5",
  maps: "M4 5h7v7H4zM13 5h7v4h-7zM13 13h7v6h-7zM4 15h7v4H4z",
  share:
    "M18 5.5m-2.4 0a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0|M6 12m-2.4 0a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0|M18 18.5m-2.4 0a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0|M8.2 10.9l7.6-4.2|M8.2 13.1l7.6 4.2",
  help: "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3|M12 17h.01",
  trash: "M4 7h16|M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2|M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13",
} as const;

// doneStyle's inline background beats any Tailwind active:bg — press
// feedback on these is opacity, not a darker wash.
const doneBtn =
  "shrink-0 rounded-full px-3 py-2 text-xs transition-opacity active:opacity-70 pointer-coarse:min-h-10";
const doneStyle = { background: "rgba(0,0,0,0.05)", color: "var(--ink-soft)" } as const;
const row =
  "flex w-full items-center gap-3 rounded-xl px-2.5 py-3 text-left text-sm transition-colors hover:bg-black/5 active:bg-black/10 disabled:opacity-40";

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between pb-1.5">
      <span className="text-sm font-medium" style={{ color: "var(--ink-soft)" }}>
        {title}
      </span>
      <button aria-label={`Close ${title}`} className={doneBtn} style={doneStyle} onClick={onClose}>
        Done
      </button>
    </div>
  );
}

/* ─────────────────────────── Rename ─────────────────────────── */

/** Rename the open map from the top bar's title tap. Enter / Save / a
 *  put-away gesture (swipe, scrim) commit — those run through the
 *  sheet's onBeforeClose. Escape cancels, wherever focus is: the app's
 *  Escape cascade closes the sheet WITHOUT touching onBeforeClose, so no
 *  commit fires. The title is display-only app state (not part of the
 *  map document), so committing is cheap and never marks the map dirty. */
export function RenameSheet({
  open,
  onClose,
  title,
  onCommit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  onCommit: (raw: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(title);
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);
  // One commit per open, and none after an explicit cancel — the sheet can
  // close through several paths at once (Save tap → blur → put-away).
  const committedRef = useRef(false);
  const cancelledRef = useRef(false);
  // Re-derive the draft as the sheet arrives (render-time derived-state
  // reset, the codebase idiom); the latches reset in the open effect below.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setText(title);
  }
  useEffect(() => {
    if (open) {
      committedRef.current = false;
      cancelledRef.current = false;
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open]);
  const commit = () => {
    if (committedRef.current || cancelledRef.current) return;
    committedRef.current = true;
    onCommit(textRef.current);
  };

  return (
    // Swipe/scrim put-aways commit via onBeforeClose — renaming then
    // flicking the sheet away shouldn't silently drop the new name.
    <BottomSheet
      open={open}
      onClose={onClose}
      onBeforeClose={commit}
      maxHeight="40dvh"
      label="Rename map"
    >
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="flex shrink-0 items-center justify-between pb-1.5">
          <span className="text-sm font-medium" style={{ color: "var(--ink-soft)" }}>
            Rename map
          </span>
        </div>
        <div className="flex items-center gap-2 pb-3">
          <input
            ref={inputRef}
            aria-label="Map name"
            className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.7)", border: "1px solid var(--line)", color: "var(--ink)" }}
            placeholder="Untitled map"
            enterKeyHint="done"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commit();
                onClose();
              } else if (e.key === "Escape") {
                cancelledRef.current = true;
                onClose();
              }
              e.stopPropagation();
            }}
          />
          <button
            className="shrink-0 rounded-xl px-4 py-2.5 text-sm text-white transition-opacity hover:opacity-90 active:opacity-75"
            style={{ background: "var(--accent)" }}
            onClick={() => {
              commit();
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

/* ─────────────────────────── Create ─────────────────────────── */

export function CreateSheet({
  open,
  onClose,
  nameValue,
  onNameChange,
  onAdd,
  onImport,
  onLoadSample,
}: {
  open: boolean;
  onClose: () => void;
  nameValue: string;
  onNameChange: (v: string) => void;
  onAdd: (name: string) => void;
  onImport: () => void;
  onLoadSample: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Focus the name field as the sheet arrives — the whole point of the
  // sheet is to type a name (Android/desktop-narrow summon the keyboard;
  // iOS may need a tap, which the field invites anyway).
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open]);

  const submit = () => {
    const n = nameValue.trim();
    if (!n) {
      inputRef.current?.focus();
      return;
    }
    onAdd(n);
  };

  // tileStyle's inline background wins over active:bg — opacity presses.
  const tile =
    "flex flex-col items-center gap-2 rounded-2xl px-3 py-4 text-xs transition-opacity hover:bg-black/5 active:opacity-70";
  const tileStyle = {
    background: "rgba(255,255,255,0.55)",
    border: "1px solid var(--line)",
    color: "var(--ink-soft)",
  } as const;

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="85dvh" label="Create">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <SheetHeader title="Create" onClose={onClose} />
        <div className="flex items-center gap-2 pb-3">
          <input
            ref={inputRef}
            data-tour="create-name"
            className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.7)", border: "1px solid var(--line)", color: "var(--ink)" }}
            placeholder="Name a part…"
            enterKeyHint="go"
            value={nameValue}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button
            data-tour="create-add"
            className="shrink-0 rounded-xl px-4 py-2.5 text-sm text-white transition-opacity hover:opacity-90 active:opacity-75"
            style={{ background: "var(--accent)" }}
            onClick={submit}
          >
            Add
          </button>
        </div>
        <p className="pb-3 text-center text-[11px]" style={{ color: "var(--ink-faint)" }}>
          It appears on the board — drag it onto the body.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button className={tile} style={tileStyle} onClick={onImport}>
            <Icon d={PATHS.import} />
            Import a list
          </button>
          <button className={tile} style={tileStyle} onClick={onLoadSample}>
            <Icon d={PATHS.sample} />
            Load a sample
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

/* ─────────────────────────── Share ─────────────────────────── */

export function ShareSheet({
  open,
  onClose,
  parts,
  arrows,
  bodyScale,
  view,
  onSaveToCloud,
  onSaveFile,
  onLoadFile,
  onOpenMyMaps,
}: {
  open: boolean;
  onClose: () => void;
  parts: Part[];
  arrows: Arrow[];
  bodyScale: number;
  view: Depth;
  onSaveToCloud: () => void;
  onSaveFile: () => void;
  onLoadFile: (file: File) => void;
  onOpenMyMaps: () => void;
}) {
  const { data: session } = authClient.useSession();
  const signedIn = !!session;
  const fileRef = useRef<HTMLInputElement>(null);
  // Success AND failure speak inline on the row itself — a floating toast
  // over an open sheet would cover its sibling rows (text never hides UI).
  const [flash, setFlash] = useState<{
    id: string;
    ok: boolean;
    text: string;
  } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mark = (id: string, ok: boolean, text: string) => {
    setFlash({ id, ok, text });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), ok ? 1400 : 2600);
  };
  // Share outcomes: "cancelled" (person closed the OS sheet) stays silent.
  const markShare = (
    id: string,
    s: "shared" | "copied" | "downloaded" | "cancelled" | "failed",
  ) => {
    if (s === "cancelled") return;
    if (s === "failed") mark(id, false, "Couldn't share");
    else
      mark(
        id,
        true,
        s === "shared" ? "Shared ✓" : s === "copied" ? "Copied ✓" : "Downloaded ✓",
      );
  };

  const shareAsText = async () =>
    markShare("text", await shareText(mapText(parts, arrows)));
  const shareMap = async () =>
    markShare("smap", await shareMapPng(parts, arrows, bodyScale, view));
  const shareFlow = async () =>
    markShare("sflow", await shareFlowchartPng(parts, arrows));
  const exportFlow = async () => {
    const ok = await downloadFlowchartPng(parts, arrows);
    mark("flow", ok, ok ? "Exported ✓" : "Couldn't export");
  };
  const exportMap = async () => {
    const ok = await downloadMapPng(parts, arrows, bodyScale, view);
    mark("map", ok, ok ? "Exported ✓" : "Couldn't export");
  };

  const label = (base: string, id: string) =>
    flash?.id === id ? flash.text : base;
  const rowInk = (id: string) =>
    flash?.id === id && !flash.ok
      ? { color: "var(--danger)" }
      : { color: "var(--ink-soft)" };

  return (
    <BottomSheet open={open} onClose={onClose} label="Share and export">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <SheetHeader title="Share & export" onClose={onClose} />

        {signedIn && (
          <>
            <button className={row} style={{ color: "var(--ink-soft)" }} onClick={() => { onOpenMyMaps(); onClose(); }}>
              <Icon d={PATHS.maps} /> My maps
            </button>
            <button className={row} style={{ color: "var(--ink-soft)" }} onClick={() => { onSaveToCloud(); onClose(); }}>
              <Icon d={PATHS.cloud} /> Save to cloud
            </button>
            <div className="my-1 h-px" style={{ background: "var(--line)" }} />
          </>
        )}

        <button className={row} style={{ color: "var(--ink-soft)" }} onClick={() => { onSaveFile(); onClose(); }}>
          <Icon d={PATHS.save} /> Save to a file
        </button>
        <button className={row} style={{ color: "var(--ink-soft)" }} onClick={() => fileRef.current?.click()}>
          <Icon d={PATHS.load} /> Load from a file
        </button>

        <div className="my-1 h-px" style={{ background: "var(--line)" }} />

        <button className={row} style={rowInk("text")} onClick={shareAsText} disabled={!parts.length}>
          <Icon d={PATHS.share} /> {label("Share as text", "text")}
        </button>
        <button className={row} style={rowInk("smap")} onClick={shareMap} disabled={!parts.length}>
          <Icon d={PATHS.share} /> {label("Share map image", "smap")}
        </button>
        <button className={row} style={rowInk("sflow")} onClick={shareFlow} disabled={!arrows.length}>
          <Icon d={PATHS.share} /> {label("Share flowchart", "sflow")}
        </button>

        <div className="my-1 h-px" style={{ background: "var(--line)" }} />

        <button className={row} style={rowInk("map")} onClick={exportMap} disabled={!parts.length}>
          <Icon d={PATHS.image} /> {label("Export map image", "map")}
        </button>
        <button className={row} style={rowInk("flow")} onClick={exportFlow} disabled={!arrows.length}>
          <Icon d={PATHS.flow} /> {label("Export flowchart", "flow")}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            onLoadFile(f);
            onClose();
          }
          e.target.value = "";
        }}
      />
    </BottomSheet>
  );
}

/* ─────────────────────────── More / Settings ─────────────────────────── */

export function MoreSheet({
  open,
  onClose,
  bodyScale,
  onBodyScale,
  autoScale,
  onAutoScale,
  draftEnabled,
  onToggleDraft,
  onShowWelcome,
  onClearMap,
}: {
  open: boolean;
  onClose: () => void;
  bodyScale: number;
  onBodyScale: (v: number) => void;
  autoScale: boolean;
  onAutoScale: (v: boolean) => void;
  draftEnabled: boolean;
  onToggleDraft: (on: boolean) => void;
  onShowWelcome: () => void;
  /** Clear the whole map (undoable) — confirmed inline here. */
  onClearMap: () => void;
}) {
  const { data: session } = authClient.useSession();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Reset the account/clear confirm/error state whenever the sheet is put away.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) {
      setConfirmDelete(false);
      setConfirmClear(false);
      setDeleteError(null);
    }
    wasOpen.current = open;
  }, [open]);

  const deleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const { error } = await authClient.deleteUser();
    if (error) {
      setDeleting(false);
      setDeleteError(error.message ?? "Couldn't delete — sign in again and retry.");
      return;
    }
    window.location.reload();
  };

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="80dvh" label="Options">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <SheetHeader title="Options" onClose={onClose} />

        {/* Body size */}
        <div className="pb-3">
          <div className="flex items-center justify-between pb-1.5">
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>Body size</span>
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px]" style={{ color: "var(--ink-soft)" }}>
              <input
                type="checkbox"
                checked={autoScale}
                onChange={(e) => onAutoScale(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              auto-space
            </label>
          </div>
          <input
            type="range"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={0.01}
            value={bodyScale}
            onChange={(e) => onBodyScale(Number(e.target.value))}
            className="w-full"
            aria-label="Body size"
          />
        </div>

        <div className="my-1 h-px" style={{ background: "var(--line)" }} />

        <label className={`${row} cursor-pointer`} style={{ color: "var(--ink-soft)" }}>
          <input
            type="checkbox"
            checked={draftEnabled}
            onChange={(e) => onToggleDraft(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Keep a local draft
        </label>
        <button className={row} style={{ color: "var(--ink-soft)" }} onClick={() => { onShowWelcome(); onClose(); }}>
          <Icon d={PATHS.help} /> Welcome & tour
        </button>
        {confirmClear ? (
          <div className="px-2 py-1.5">
            <p className="pb-1.5 text-[11px]" style={{ color: "var(--ink-soft)" }}>
              Clear the whole map? You can undo this.
            </p>
            <div className="flex gap-1.5">
              <button
                className="flex-1 rounded-lg px-2 py-2 text-xs"
                style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
                onClick={() => { setConfirmClear(false); onClearMap(); onClose(); }}
              >
                Clear
              </button>
              <button
                className="flex-1 rounded-lg px-2 py-2 text-xs"
                style={{ color: "var(--ink-soft)" }}
                onClick={() => setConfirmClear(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className={row} style={{ color: "var(--ink-soft)" }} onClick={() => setConfirmClear(true)}>
            <Icon d={PATHS.trash} /> Clear map
          </button>
        )}

        <div className="my-1 h-px" style={{ background: "var(--line)" }} />

        {session ? (
          <>
            <button className={row} style={{ color: "var(--ink-soft)" }} onClick={() => authClient.signOut()}>
              Sign out
            </button>
            {confirmDelete ? (
              <div className="px-2 py-1.5">
                <p className="pb-1.5 text-[11px]" style={{ color: "var(--ink-soft)" }}>
                  Delete your account and all cloud maps?
                </p>
                {deleteError && (
                  <p className="pb-1.5 text-[11px]" style={{ color: "var(--danger)" }}>{deleteError}</p>
                )}
                <div className="flex gap-1.5">
                  <button
                    className="flex-1 rounded-lg px-2 py-2 text-xs disabled:opacity-60"
                    style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
                    disabled={deleting}
                    onClick={deleteAccount}
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                  <button
                    className="flex-1 rounded-lg px-2 py-2 text-xs"
                    style={{ color: "var(--ink-soft)" }}
                    disabled={deleting}
                    onClick={() => { setConfirmDelete(false); setDeleteError(null); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className={row} style={{ color: "var(--danger)" }} onClick={() => setConfirmDelete(true)}>
                Delete account
              </button>
            )}
          </>
        ) : (
          <a href="/sign-in" className={row} style={{ color: "var(--ink-soft)" }}>
            Sign in
          </a>
        )}
      </div>
    </BottomSheet>
  );
}
