"use client";

/* ════════════════════════════════════════════════════════════════════
   PART EDITOR — the same editor in both layouts: desktop floating
   popover + phone bottom sheet, sharing the name/note/location fields
   ════════════════════════════════════════════════════════════════════ */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { PALETTE, PALETTE_NAMES } from "@/lib/tuning";
import { REGION_BY_KEY } from "@/lib/regions";
import type { Part } from "@/lib/types";
import { locationDisplay, partSurface, FONT_SIZE_LABELS } from "@/lib/part-utils";
import { panelStyle } from "@/lib/ui";
import { useAppApi, usePartsList } from "@/hooks/use-app-api";
import { LocationPicker } from "@/components/location-picker";
import { BottomSheet } from "@/components/bottom-sheet";

/** A draft field (name/note/location) registers its own commit callback
 *  here while mounted, keyed by a stable id. The phone sheet stays
 *  mounted while it slides off-screen (so it can animate the exit), so a
 *  plain `onBlur` isn't guaranteed to fire on every way of dismissing it
 *  — Done, a completed swipe, or the parent deselecting the part out
 *  from under it. `flushPending()` (called from all three paths) runs
 *  every registered commit, so a pending edit that never blurred still
 *  lands instead of silently vanishing. Each commit already no-ops when
 *  its draft matches the authoritative value, so a redundant flush after
 *  a real blur is harmless. */
type CommitMap = Map<string, () => void>;
const CommitRegistryContext = React.createContext<CommitMap | null>(null);

/** Registers `commit` under `key` for as long as the field is mounted
 *  (only meaningful inside a CommitRegistryContext — a no-op elsewhere),
 *  and — separately — flushes it on the field's own unmount. That second
 *  part is what saves the desktop popover: it doesn't slide away, it
 *  really unmounts (React Flow's NodeToolbar hides by unmounting its
 *  children) the moment Escape or a pane-click deselects the part. */
function useCommitOnDismiss(key: string, commit: () => void) {
  const registry = React.useContext(CommitRegistryContext);
  const commitRef = useRef(commit);
  // Keep the ref current — an effect (not a render-time write) so the
  // ref is only ever touched outside of render, per the rules of React.
  useEffect(() => {
    commitRef.current = commit;
  });
  useEffect(() => {
    if (!registry) return;
    registry.set(key, () => commitRef.current());
    return () => {
      registry.delete(key);
    };
  }, [registry, key]);
  useEffect(() => () => commitRef.current(), []);
}

/** Editable part name (popover + phone sheet). Local draft, committed on
 *  blur / Enter; an emptied field falls back to the current name. */
function NameField({ part, sheet }: { part: Part; sheet?: boolean }) {
  const api = useAppApi();
  const [text, setText] = useState(part.name);
  // Render-time derived-state reset when the part (or its name) changes.
  const [lastKey, setLastKey] = useState(`${part.id}:${part.name}`);
  if (lastKey !== `${part.id}:${part.name}`) {
    setLastKey(`${part.id}:${part.name}`);
    setText(part.name);
  }
  const commit = () => {
    const n = text.trim();
    if (!n) {
      setText(part.name);
      return;
    }
    if (n !== part.name) api.updatePart(part.id, { name: n });
  };
  useCommitOnDismiss(`name:${part.id}`, commit);
  return (
    <input
      className={`nodrag nopan w-full rounded-md px-2 outline-none ${
        sheet ? "py-2 text-sm" : "py-1 text-xs"
      }`}
      style={{
        background: "rgba(255,255,255,0.7)",
        border: "1px solid var(--line)",
        color: "var(--ink)",
      }}
      value={text}
      placeholder="name…"
      aria-label="Part name"
      data-part-name-input
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

/** Optional private note (popover + phone sheet). Local draft, committed
 *  on blur; an emptied field clears the note. */
function NoteField({ part, sheet }: { part: Part; sheet?: boolean }) {
  const api = useAppApi();
  const [text, setText] = useState(part.note ?? "");
  const [lastKey, setLastKey] = useState(`${part.id}:${part.note ?? ""}`);
  if (lastKey !== `${part.id}:${part.note ?? ""}`) {
    setLastKey(`${part.id}:${part.note ?? ""}`);
    setText(part.note ?? "");
  }
  const commit = () => {
    const n = text.trim().slice(0, 500);
    if (n !== (part.note ?? "")) {
      api.updatePart(part.id, { note: n || undefined });
    }
  };
  useCommitOnDismiss(`note:${part.id}`, commit);
  return (
    <textarea
      className={`nodrag nopan w-full resize-none rounded-md px-2 outline-none ${
        sheet ? "py-2 text-sm" : "py-1 text-xs"
      }`}
      style={{
        background: "rgba(255,255,255,0.7)",
        border: "1px solid var(--line)",
        color: "var(--ink)",
      }}
      rows={2}
      maxLength={500}
      value={text}
      placeholder="note…"
      aria-label="Part note"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

/** Editable, text-authoritative location field — the desktop dialect
 *  (popover + list): a free-text input with a native datalist. The phone
 *  sheet uses LocationPicker instead (a native datalist reads as a
 *  broken dropdown on a small screen); this stays for desktop where a
 *  keyboard + mouse makes the datalist genuinely useful. */
export function LocationField({
  part,
  compact,
}: {
  part: Part;
  compact?: boolean;
}) {
  const api = useAppApi();
  const display = locationDisplay(part);
  const [text, setText] = useState(display);
  const [invalid, setInvalid] = useState(false);
  // Reset local text when the authoritative location changes (render-time
  // derived-state reset — no effect needed).
  const [lastDisplay, setLastDisplay] = useState(display);
  if (lastDisplay !== display) {
    setLastDisplay(display);
    setText(display);
    setInvalid(false);
  }

  const commit = () => {
    if (text.trim() === display) return;
    const ok = api.setLocationText(part.id, text);
    setInvalid(!ok);
  };
  useCommitOnDismiss(`location:${part.id}`, commit);

  return (
    <input
      className={`nodrag nopan rounded-md px-2 outline-none transition-shadow ${
        compact ? "w-full py-0.5 text-[11px]" : "w-44 py-1 text-xs"
      }`}
      style={{
        background: "rgba(255,255,255,0.7)",
        border: invalid ? "1px solid #C08A8A" : "1px solid var(--line)",
        color: "var(--ink-soft)",
      }}
      list="region-labels"
      value={text}
      placeholder="location…"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

/** Pointer-free arrow creation: a native <select> of the other parts.
 *  Choosing one draws an arrow from this part to it — the keyboard/touch
 *  counterpart to dragging a connect dot (dragging is the only other way
 *  to make a relationship, and it's unreachable without a pointer). A
 *  native select gets full keyboard operation and the OS picker on phones
 *  for free. Controlled to "" so it always springs back to the prompt
 *  after a pick. Hidden when there's no other part to link to yet. */
function ConnectField({ part, sheet }: { part: Part; sheet?: boolean }) {
  const api = useAppApi();
  const parts = usePartsList();
  const others = parts.filter((o) => o.id !== part.id);
  if (others.length === 0) return null;
  return (
    <select
      aria-label={`Draw an arrow from ${part.name} to another part`}
      className={`nodrag nopan w-full rounded-md outline-none ${
        sheet ? "min-h-10 px-3 text-sm" : "px-2 py-1 text-xs"
      }`}
      style={{
        background: "rgba(255,255,255,0.7)",
        border: "1px solid var(--line)",
        color: "var(--ink-soft)",
      }}
      value=""
      onChange={(e) => {
        if (e.target.value) api.connectParts(part.id, e.target.value);
      }}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <option value="" disabled>
        Draw arrow to…
      </option>
      {others.map((o) => (
        <option key={o.id} value={o.id}>
          → {o.name}
        </option>
      ))}
    </select>
  );
}

/** Lean Miro-style card editor: color, size, bold, shape, location, delete. */
export function EditPopover({ part }: { part: Part }) {
  const api = useAppApi();
  // A mis-tap delete used to be permanent (no confirmation, and until
  // recently no visible Undo either) — one extra tap before it actually
  // happens, mirroring the confirm pattern already used in my-maps.tsx.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const chip = (active: boolean): React.CSSProperties => ({
    border: "1px solid var(--line)",
    background: active ? "var(--ink)" : "rgba(255,255,255,0.7)",
    color: active ? "#fff" : "var(--ink-soft)",
  });
  return (
    <div
      className="fade-in flex w-[288px] max-w-[92vw] flex-wrap items-center gap-x-1.5 gap-y-1.5 rounded-2xl px-3 py-2.5"
      style={panelStyle}
    >
      <div className="w-full">
        <NameField part={part} />
      </div>
      <div className="flex">
        {PALETTE.map((c) => (
          <button
            key={c}
            aria-label={`Color: ${PALETTE_NAMES[c] ?? c}`}
            aria-pressed={part.color === c}
            onClick={() => api.updatePart(part.id, { color: c })}
            className="flex h-8 w-8 items-center justify-center rounded-full"
          >
            <span
              className="h-5 w-5 rounded-full"
              style={{
                background: c,
                border: "1px solid rgba(58,55,51,0.18)",
                outline:
                  part.color === c ? "2px solid var(--ink-soft)" : "none",
                outlineOffset: 1,
              }}
            />
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {(["s", "m", "l"] as const).map((s) => (
          <button
            key={s}
            aria-label={`Text size: ${FONT_SIZE_LABELS[s]}`}
            aria-pressed={part.fontSize === s}
            onClick={() => api.updatePart(part.id, { fontSize: s })}
            className="min-h-8 rounded-md px-2 py-1"
            style={{
              ...chip(part.fontSize === s),
              fontSize: s === "s" ? 10 : s === "m" ? 12 : 14,
            }}
          >
            A
          </button>
        ))}
        <button
          aria-label="Bold"
          aria-pressed={part.bold}
          onClick={() => api.updatePart(part.id, { bold: !part.bold })}
          className="min-h-8 rounded-md px-2.5 py-1 text-xs font-bold"
          style={chip(part.bold)}
        >
          B
        </button>
        <div className="mx-0.5 h-4 w-px" style={{ background: "var(--line)" }} />
        {(
          [
            ["rounded", "▢"],
            ["square", "□"],
            ["pill", "⬭"],
            ["ellipse", "◯"],
          ] as const
        ).map(([shape, glyph]) => (
          <button
            key={shape}
            aria-label={`Shape: ${shape}`}
            aria-pressed={part.shape === shape}
            onClick={() => api.updatePart(part.id, { shape })}
            className="min-h-8 rounded-md px-2 py-1 text-xs"
            style={chip(part.shape === shape)}
          >
            {glyph}
          </button>
        ))}
      </div>
      <div className="w-full">
        <NoteField part={part} />
      </div>
      <div className="w-full">
        <ConnectField part={part} />
      </div>
      <div className="flex w-full items-center gap-2">
        {confirmDelete ? (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
              Delete “{part.name}”?
            </span>
            <button
              aria-label={`Confirm delete “${part.name}”`}
              onClick={() => api.deletePart(part.id)}
              className="min-h-8 rounded-md px-2.5 py-1 text-xs"
              style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
            >
              delete
            </button>
            <button
              aria-label="Cancel delete"
              onClick={() => setConfirmDelete(false)}
              className="min-h-8 rounded-md px-2.5 py-1 text-xs"
              style={{ color: "var(--ink-soft)" }}
            >
              cancel
            </button>
          </div>
        ) : (
          <>
            <LocationField part={part} />
            <button
              aria-label="Delete part"
              onClick={() => setConfirmDelete(true)}
              className="ml-auto min-h-8 rounded-md px-2.5 py-1 text-xs"
              style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
            >
              delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Phone card editor: the same editor rethought as a bottom sheet — one
 *  thumb, big targets, swipe down (or ✕ / tap the canvas) to put away.
 *  Always mounted so the slide in/out can animate; keeps the last part
 *  while sliding out so the content never blanks mid-exit. */
export function MobileEditSheet({
  part,
  open,
  onClose,
}: {
  part: Part | null;
  open: boolean;
  onClose: () => void;
}) {
  const api = useAppApi();
  // Keep the last part while sliding out (render-time derived-state
  // reset — the codebase idiom, see LocationField).
  const [lastPart, setLastPart] = useState<Part | null>(null);
  if (part && part !== lastPart) setLastPart(part);
  const p = part ?? lastPart;
  const [pickerOpen, setPickerOpen] = useState(false);
  // Which part id (if any) has a pending delete confirmation — comparing
  // against the current part rather than a plain boolean means switching
  // parts (the sheet stays mounted) can't carry a stale confirm state over.
  const [confirmDeleteFor, setConfirmDeleteFor] = useState<string | null>(null);

  // The registry every draft field below registers into (see
  // CommitRegistryContext) — a stable Map for the sheet's lifetime. A
  // lazy useState initializer (never actually set again) keeps this to
  // exactly one Map without touching a ref during render.
  const [registry] = useState<CommitMap>(() => new Map());
  const flushPending = useCallback(() => {
    for (const fn of registry.values()) fn();
  }, [registry]);

  // Any way the sheet closes without going through Done or the swipe
  // (chiefly: the parent deselecting the part from a pane tap) still
  // needs its pending edits flushed, and the picker shouldn't be left
  // open the next time a card is tapped.
  const wasOpenRef = useRef(open);
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      flushPending();
      setPickerOpen(false);
      setConfirmDeleteFor(null);
    }
    wasOpenRef.current = open;
  }, [open, flushPending]);

  if (!p) return null;
  const confirmingDelete = confirmDeleteFor === p.id;

  const region = REGION_BY_KEY[p.location];
  const surface = partSurface(p);
  // Front/back flip: only where the part's own region exists on both
  // surfaces (paired back regions like the occiput keep their own key).
  const canFlip =
    !p.offBody &&
    !!region &&
    !region.offBody &&
    !region.isBack &&
    (region.hasBack || !!region.bothViews);

  const chip = (active: boolean): React.CSSProperties => ({
    border: "1px solid var(--line)",
    background: active ? "var(--ink)" : "rgba(255,255,255,0.7)",
    color: active ? "#fff" : "var(--ink-soft)",
  });

  return (
    // 85dvh (vs the list sheet's 62dvh) leaves room for the fields to
    // scroll above the iOS keyboard, which overlays without resizing the
    // layout viewport. onBeforeClose flushes pending edits on a swipe-away.
    <BottomSheet
      open={open}
      onClose={onClose}
      onBeforeClose={flushPending}
      maxHeight="85dvh"
      label="Edit part"
    >
      <CommitRegistryContext.Provider value={registry}>
        <div className="flex-1 overflow-y-auto overscroll-contain">
        {pickerOpen ? (
          <LocationPicker part={p} onDone={() => setPickerOpen(false)} />
        ) : (
          <>
            <div className="flex items-center gap-2 pb-2.5">
              <NameField part={p} sheet />
              <button
                aria-label="Done editing"
                className="shrink-0 rounded-full px-3 py-2 text-xs"
                style={{
                  background: "rgba(0,0,0,0.05)",
                  color: "var(--ink-soft)",
                }}
                onClick={() => {
                  flushPending();
                  onClose();
                }}
              >
                Done
              </button>
            </div>
            <div className="flex justify-between pb-2.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  aria-label={`Color: ${PALETTE_NAMES[c] ?? c}`}
                  aria-pressed={p.color === c}
                  onClick={() => api.updatePart(p.id, { color: c })}
                  className="flex h-10 w-10 items-center justify-center rounded-full"
                >
                  <span
                    className="h-7 w-7 rounded-full"
                    style={{
                      background: c,
                      border: "1px solid rgba(58,55,51,0.18)",
                      outline:
                        p.color === c ? "2px solid var(--ink-soft)" : "none",
                      outlineOffset: 2,
                    }}
                  />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 pb-2.5">
              {(["s", "m", "l"] as const).map((s) => (
                <button
                  key={s}
                  aria-label={`Text size: ${FONT_SIZE_LABELS[s]}`}
                  aria-pressed={p.fontSize === s}
                  onClick={() => api.updatePart(p.id, { fontSize: s })}
                  className="min-h-10 flex-1 rounded-lg"
                  style={{
                    ...chip(p.fontSize === s),
                    fontSize: s === "s" ? 11 : s === "m" ? 14 : 17,
                  }}
                >
                  A
                </button>
              ))}
              <button
                aria-label="Bold"
                aria-pressed={p.bold}
                onClick={() => api.updatePart(p.id, { bold: !p.bold })}
                className="min-h-10 flex-1 rounded-lg text-sm font-bold"
                style={chip(p.bold)}
              >
                B
              </button>
              <div
                className="mx-1 h-6 w-px"
                style={{ background: "var(--line)" }}
              />
              {(
                [
                  ["rounded", "▢"],
                  ["square", "□"],
                  ["pill", "⬭"],
                  ["ellipse", "◯"],
                ] as const
              ).map(([shape, glyph]) => (
                <button
                  key={shape}
                  aria-pressed={p.shape === shape}
                  aria-label={`Shape: ${shape}`}
                  onClick={() => api.updatePart(p.id, { shape })}
                  className="min-h-10 flex-1 rounded-lg text-sm"
                  style={chip(p.shape === shape)}
                >
                  {glyph}
                </button>
              ))}
            </div>
            {confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[13px]" style={{ color: "var(--ink-soft)" }}>
                  Delete “{p.name}”?
                </span>
                <button
                  aria-label={`Confirm delete “${p.name}”`}
                  onClick={() => {
                    api.deletePart(p.id);
                    onClose();
                  }}
                  className="min-h-10 shrink-0 rounded-lg px-3.5 text-xs"
                  style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
                >
                  delete
                </button>
                <button
                  aria-label="Cancel delete"
                  onClick={() => setConfirmDeleteFor(null)}
                  className="min-h-10 shrink-0 rounded-lg px-3.5 text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  aria-label="Edit location"
                  onClick={() => setPickerOpen(true)}
                  className="flex min-h-10 flex-1 items-center justify-between rounded-lg px-3 text-left text-sm"
                  style={{
                    background: "rgba(255,255,255,0.7)",
                    border: "1px solid var(--line)",
                    color: "var(--ink-soft)",
                  }}
                >
                  <span className="truncate">{locationDisplay(p)}</span>
                  <span aria-hidden style={{ color: "var(--ink-faint)" }}>
                    ›
                  </span>
                </button>
                {canFlip && (
                  <div
                    className="flex shrink-0 overflow-hidden rounded-lg"
                    style={{ border: "1px solid var(--line)" }}
                    role="group"
                    aria-label="Body surface"
                  >
                    {(["front", "back"] as const).map((d) => (
                      <button
                        key={d}
                        aria-pressed={surface === d}
                        className="min-h-10 px-3 text-[11px] uppercase tracking-wide"
                        style={{
                          background:
                            surface === d ? "var(--ink)" : "rgba(255,255,255,0.7)",
                          color: surface === d ? "#fff" : "var(--ink-soft)",
                        }}
                        onClick={() => surface !== d && api.setDepth(p.id, d)}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  aria-label="Delete part"
                  onClick={() => setConfirmDeleteFor(p.id)}
                  className="ml-auto min-h-10 shrink-0 rounded-lg px-3.5 text-xs"
                  style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
                >
                  delete
                </button>
              </div>
            )}
            <div className="pt-2.5">
              <ConnectField part={p} sheet />
            </div>
            <div className="pt-2.5">
              <NoteField part={p} sheet />
            </div>
          </>
        )}
        </div>
      </CommitRegistryContext.Provider>
    </BottomSheet>
  );
}
