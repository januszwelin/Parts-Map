"use client";

/* ════════════════════════════════════════════════════════════════════
   PHONE SHEETS — the three bottom sheets reached from the phone chrome:
   • CreateSheet  (from the + pill)        — name a part, or import / sample
   • ShareSheet   (from the top-bar share) — cloud/file save & load, exports
   • MoreSheet    (from the top-bar ⋯)      — body size, sound, draft, account
   All built on the shared BottomSheet shell. Phone only.
   ════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from "react";
import type { Arrow, Part } from "@/lib/types";
import { locationDisplay } from "@/lib/part-utils";
import {
  copyText,
  relationshipsText,
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

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden style={{ display: "block" }}>
      {d.split("|").map((seg, i) => (
        <path key={i} d={seg} />
      ))}
    </svg>
  );
}

const PATHS = {
  import: "M12 15V3|M8 7l4-4 4 4|M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  sample: "M12 3v4|M12 17v4|M3 12h4|M17 12h4|M7 7l2.5 2.5|M14.5 14.5 17 17|M17 7l-2.5 2.5|M9.5 14.5 7 17",
  cloud: "M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1A3.5 3.5 0 0 1 17 18H7Z",
  save: "M12 3v12|M8 11l4 4 4-4|M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  load: "M12 15V3|M8 7l4-4 4 4|M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  copy: "M9 9h10v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1Z|M5 15V4a1 1 0 0 1 1-1h9",
  flow: "M9 4h6v3H9zM4 17h6v3H4zm10 0h6v3h-6zM12 7v4|M7 13v-2h10v2",
  image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5",
  maps: "M4 5h7v7H4zM13 5h7v4h-7zM13 13h7v6h-7zM4 15h7v4H4z",
  sound: "M11 5 6 9H2v6h4l5 4V5Z|M15.5 8.5a5 5 0 0 1 0 7",
  help: "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3|M12 17h.01",
} as const;

const doneBtn =
  "shrink-0 rounded-full px-3 py-2 text-xs";
const doneStyle = { background: "rgba(0,0,0,0.05)", color: "var(--ink-soft)" } as const;
const row =
  "flex w-full items-center gap-3 rounded-xl px-2.5 py-3 text-left text-sm transition-colors hover:bg-black/5 disabled:opacity-40";

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

  const tile =
    "flex flex-col items-center gap-2 rounded-2xl px-3 py-4 text-xs transition-colors hover:bg-black/5";
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
            className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.7)", border: "1px solid var(--line)", color: "var(--ink)" }}
            placeholder="Name a part…"
            enterKeyHint="go"
            value={nameValue}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button
            className="shrink-0 rounded-xl px-4 py-2.5 text-sm text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)" }}
            onClick={submit}
          >
            Add
          </button>
        </div>
        <p className="pb-3 text-center text-[11px]" style={{ color: "var(--ink-faint)" }}>
          Then tap where the part lives.
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
  onSaveToCloud,
  onSaveFile,
  onLoadFile,
  onOpenMyMaps,
  onNotice,
}: {
  open: boolean;
  onClose: () => void;
  parts: Part[];
  arrows: Arrow[];
  bodyScale: number;
  onSaveToCloud: () => void;
  onSaveFile: () => void;
  onLoadFile: (file: File) => void;
  onOpenMyMaps: () => void;
  onNotice: (text: string) => void;
}) {
  const { data: session } = authClient.useSession();
  const signedIn = !!session;
  const fileRef = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mark = (id: string) => {
    setFlash(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1400);
  };

  const copyList = async () => {
    const text = parts
      .map((p) => `${p.name}\t${locationDisplay(p)}${p.note ? `\t${p.note}` : ""}`)
      .join("\n");
    if (!(await copyText(text))) {
      onNotice("Couldn't copy — your browser may be blocking clipboard access.");
      return;
    }
    mark("list");
  };
  const copyRel = async () => {
    if (!(await copyText(relationshipsText(parts, arrows)))) {
      onNotice("Couldn't copy — your browser may be blocking clipboard access.");
      return;
    }
    mark("rel");
  };
  const exportFlow = async () => {
    if (!(await downloadFlowchartPng(parts, arrows))) {
      onNotice("Couldn't export the flowchart image.");
      return;
    }
    mark("flow");
  };
  const exportMap = async () => {
    if (!(await downloadMapPng(parts, arrows, bodyScale))) {
      onNotice("Couldn't export the map image.");
      return;
    }
    mark("map");
  };

  const label = (base: string, id: string, done: string) =>
    flash === id ? done : base;

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

        <button className={row} style={{ color: "var(--ink-soft)" }} onClick={copyList} disabled={!parts.length}>
          <Icon d={PATHS.copy} /> {label("Copy list", "list", "Copied ✓")}
        </button>
        <button className={row} style={{ color: "var(--ink-soft)" }} onClick={copyRel} disabled={!arrows.length}>
          <Icon d={PATHS.copy} /> {label("Copy relationships", "rel", "Copied ✓")}
        </button>
        <button className={row} style={{ color: "var(--ink-soft)" }} onClick={exportFlow} disabled={!arrows.length}>
          <Icon d={PATHS.flow} /> {label("Export flowchart", "flow", "Exported ✓")}
        </button>
        <button className={row} style={{ color: "var(--ink-soft)" }} onClick={exportMap} disabled={!parts.length}>
          <Icon d={PATHS.image} /> {label("Export map image", "map", "Exported ✓")}
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
  soundOn,
  onToggleSound,
  draftEnabled,
  onToggleDraft,
  onShowWelcome,
}: {
  open: boolean;
  onClose: () => void;
  bodyScale: number;
  onBodyScale: (v: number) => void;
  autoScale: boolean;
  onAutoScale: (v: boolean) => void;
  soundOn: boolean;
  onToggleSound: () => void;
  draftEnabled: boolean;
  onToggleDraft: (on: boolean) => void;
  onShowWelcome: () => void;
}) {
  const { data: session } = authClient.useSession();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Reset the account confirm/error state whenever the sheet is put away.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) {
      setConfirmDelete(false);
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

        <button className={row} style={{ color: "var(--ink-soft)" }} aria-pressed={soundOn} onClick={onToggleSound}>
          <Icon d={soundOn ? PATHS.sound : "M11 5 6 9H2v6h4l5 4V5Z|M16 9.5l5 5|M21 9.5l-5 5"} />
          {soundOn ? "Sound on" : "Sound off"}
        </button>
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
