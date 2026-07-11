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
import { cardStyle } from "@/lib/ui";
import { useAppApi, usePartsList, useArrowsList } from "@/hooks/use-app-api";
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

/** Touch press feedback for controls whose background is an inline style
 *  (chip(), danger-bg, frosted rows) — Tailwind's active:bg can't win
 *  against those, so the press reads as a small scale dip instead. */
const pressScale =
  "transition-transform active:scale-[0.97] motion-reduce:active:scale-100";

/** Registers `commit` under `key` for as long as the field is mounted
 *  (only meaningful inside a CommitRegistryContext — a no-op elsewhere),
 *  and — separately — flushes it on the field's own unmount. That second
 *  part is what saves the desktop popover: it doesn't slide away, it
 *  really unmounts (React Flow's NodeToolbar hides by unmounting its
 *  children) the moment Escape or a pane-click deselects the part.
 *  Exported for the arrow-label field (floating-edge.tsx), whose every
 *  dismiss path also unmounts it — iOS doesn't blur a focused field on
 *  scrim/grab-strip taps, so blur-only commits silently lost typed text. */
export function useCommitOnDismiss(key: string, commit: () => void) {
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
      enterKeyHint="done"
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
      className={`nodrag nopan nowheel w-full resize-none rounded-md px-2 outline-none ${
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
      enterKeyHint="done"
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
function ConnectField({
  part,
  sheet,
  onPicked,
}: {
  part: Part;
  sheet?: boolean;
  /** Fires after an arrow is drawn — the phone sheet closes itself so the
   *  new arrow is visible; the desktop popover deliberately stays open
   *  (it doesn't cover the arrow, and keyboard users may draw several). */
  onPicked?: () => void;
}) {
  const api = useAppApi();
  const parts = usePartsList();
  const arrows = useArrowsList();
  const others = parts.filter((o) => o.id !== part.id);
  if (others.length === 0) return null;
  // Targets this part already points at are greyed out instead of
  // silently deduped — picking one used to close the sheet with nothing
  // visibly happening. Reverse-direction links stay pickable (A→B and
  // B→A are different relationships).
  const linked = new Set(
    arrows.filter((a) => a.sourceId === part.id).map((a) => a.targetId),
  );
  const select = (
    <select
      aria-label={`Draw an arrow from ${part.name} to another part`}
      data-tour={sheet ? "connect" : undefined}
      className={`nodrag nopan w-full rounded-md outline-none ${
        sheet ? "min-h-10 appearance-none px-3 pr-8 text-sm" : "px-2 py-1 text-xs"
      }`}
      style={{
        background: "rgba(255,255,255,0.7)",
        border: "1px solid var(--line)",
        color: "var(--ink-soft)",
      }}
      value=""
      onChange={(e) => {
        // Close only when an arrow was actually created.
        if (e.target.value && api.connectParts(part.id, e.target.value)) {
          onPicked?.();
        }
      }}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <option value="" disabled>
        Draw arrow to…
      </option>
      {others.map((o) => (
        <option key={o.id} value={o.id} disabled={linked.has(o.id)}>
          → {o.name}
          {linked.has(o.id) ? " — linked" : ""}
        </option>
      ))}
    </select>
  );
  if (!sheet) return select; // desktop keeps the native select chrome
  return (
    // appearance-none stops iOS painting its own control chrome over the
    // styled border; the ▾ restores the affordance it removes.
    <div className="relative">
      {select}
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs"
        style={{ color: "var(--ink-faint)" }}
      >
        ▾
      </span>
    </div>
  );
}

/* ————— toolbar icons (inline SVG, app convention) ————— */
const iconStroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;
function GripIcon() {
  return (
    <svg width={8} height={16} viewBox="0 0 8 16" fill="currentColor" aria-hidden style={{ display: "block" }}>
      {[3, 8, 13].map((y) => [1.5, 6.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.2} />))}
    </svg>
  );
}
function DuplicateIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" {...iconStroke} aria-hidden style={{ display: "block" }}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a1 1 0 0 1 1-1h9" />
    </svg>
  );
}
function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" {...iconStroke} aria-hidden style={{ display: "block" }}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      {locked ? <path d="M8 11V7a4 4 0 0 1 8 0v4" /> : <path d="M8 11V7a4 4 0 0 1 7.5-1.7" />}
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" {...iconStroke} aria-hidden style={{ display: "block" }}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ display: "block" }}>
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" {...iconStroke} aria-hidden style={{ display: "block" }}>
      <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

/** Desktop selection toolbar — a horizontal Miro-style bar of icon
 *  controls, movable by its dots grip. Inline: name · fill · size · bold ·
 *  duplicate · lock · delete; the rest (shape, location, note, draw-arrow)
 *  live behind the ⋮ overflow. */
export function EditPopover({ part }: { part: Part }) {
  const api = useAppApi();
  // A mis-tap delete used to be permanent (no confirmation, and until
  // recently no visible Undo either) — one extra tap before it actually
  // happens, mirroring the confirm pattern already used in my-maps.tsx.
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Which sub-popover is open, if any: the fill palette, the text-size
  // menu, the location picker, or the ⋮ overflow.
  const [openPop, setOpenPop] = useState<
    null | "fill" | "size" | "location" | "more"
  >(null);
  // Drag-grip offset — lets the user nudge the bar off the card it's
  // covering. Reset when a different part is selected (render-time
  // derived-state reset, NOT an effect — the repo's
  // react-hooks/set-state-in-effect rule; same idiom as LocationField).
  const [offset, setOffset] = useState({ dx: 0, dy: 0 });
  const [lastId, setLastId] = useState(part.id);
  if (lastId !== part.id) {
    setLastId(part.id);
    setOffset({ dx: 0, dy: 0 });
    setOpenPop(null);
    setConfirmDelete(false);
  }
  const dragRef = useRef<{
    x0: number;
    y0: number;
    dx0: number;
    dy0: number;
  } | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Close an open sub-popover on an outside pointer-down or Escape. A plain
  // `fixed inset-0` catcher can't work here: the grip's transform on the root
  // makes `position:fixed` resolve to the toolbar's own box, so it never
  // covers the screen (and its overlay swallowed the first click on the
  // inline controls). A document listener sidesteps that containing-block
  // trap. (Listener callbacks may call setState — the lint rule only bars
  // setState in the effect body itself.)
  useEffect(() => {
    if (!openPop) return;
    const onDown = (e: PointerEvent) => {
      if (!toolbarRef.current?.contains(e.target as Node)) setOpenPop(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpenPop(null);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [openPop]);
  const onGripDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = { x0: e.clientX, y0: e.clientY, dx0: offset.dx, dy0: offset.dy };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onGripMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    // NodeToolbar renders at screen scale (not flow-zoomed), so a client-px
    // delta maps 1:1 to the translate offset.
    setOffset({ dx: d.dx0 + (e.clientX - d.x0), dy: d.dy0 + (e.clientY - d.y0) });
  };
  const onGripUp = () => {
    dragRef.current = null;
  };

  const chip = (active: boolean): React.CSSProperties => ({
    border: "1px solid var(--line)",
    background: active ? "var(--ink)" : "#fff",
    color: active ? "#fff" : "var(--ink-soft)",
  });
  const iconBtn =
    "flex h-8 w-8 items-center justify-center rounded-md hover:bg-black/5";
  const divider = (
    <div className="mx-0.5 h-5 w-px shrink-0" style={{ background: "var(--line)" }} />
  );

  return (
    <div
      ref={toolbarRef}
      className="fade-in nodrag nopan nowheel flex items-center gap-1 rounded-2xl px-1.5 py-1.5"
      style={{ ...cardStyle, transform: `translate(${offset.dx}px, ${offset.dy}px)` }}
    >
      {/* drag grip */}
      <div
        role="button"
        aria-label="Move toolbar"
        title="Drag to move"
        className="nodrag nopan flex h-8 w-5 shrink-0 cursor-grab items-center justify-center rounded-md hover:bg-black/5"
        style={{ touchAction: "none", color: "var(--ink-faint)" }}
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
      >
        <GripIcon />
      </div>

      <div className="w-28 shrink-0">
        <NameField part={part} />
      </div>

      {divider}

      {/* fill color */}
      <div className="relative shrink-0">
        <button
          aria-label="Fill color"
          aria-expanded={openPop === "fill"}
          className={iconBtn}
          onClick={() => setOpenPop((p) => (p === "fill" ? null : "fill"))}
        >
          <span
            className="h-5 w-5 rounded-full"
            style={{ background: part.color, border: "1px solid rgba(58,55,51,0.18)" }}
          />
        </button>
        {openPop === "fill" && (
          <div
            className="fade-in absolute left-0 top-full z-20 mt-1 grid w-[152px] grid-cols-4 gap-1 rounded-xl p-2"
            style={cardStyle}
          >
            {PALETTE.map((c) => (
              <button
                key={c}
                aria-label={`Color: ${PALETTE_NAMES[c] ?? c}`}
                aria-pressed={part.color === c}
                onClick={() => {
                  api.updatePart(part.id, { color: c });
                  setOpenPop(null);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full"
              >
                <span
                  className="h-5 w-5 rounded-full"
                  style={{
                    background: c,
                    border: "1px solid rgba(58,55,51,0.18)",
                    outline: part.color === c ? "2px solid var(--ink-soft)" : "none",
                    outlineOffset: 1,
                  }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* text size (dropdown, mirrors the fill picker) */}
      <div className="relative shrink-0">
        <button
          aria-label={`Text size: ${FONT_SIZE_LABELS[part.fontSize]}`}
          aria-expanded={openPop === "size"}
          className="flex min-h-8 items-center gap-0.5 rounded-md px-2 py-1"
          style={chip(false)}
          onClick={() => setOpenPop((p) => (p === "size" ? null : "size"))}
        >
          <span style={{ fontSize: 13 }}>A</span>
          <span aria-hidden style={{ fontSize: 9, color: "var(--ink-faint)" }}>
            ▾
          </span>
        </button>
        {openPop === "size" && (
          <div
            className="fade-in absolute left-0 top-full z-20 mt-1 flex w-[116px] flex-col gap-0.5 rounded-xl p-1.5"
            style={cardStyle}
          >
            {(["s", "m", "l"] as const).map((s) => (
              <button
                key={s}
                aria-label={`Text size: ${FONT_SIZE_LABELS[s]}`}
                aria-pressed={part.fontSize === s}
                onClick={() => {
                  api.updatePart(part.id, { fontSize: s });
                  setOpenPop(null);
                }}
                className="flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-left"
                style={chip(part.fontSize === s)}
              >
                <span style={{ fontSize: s === "s" ? 11 : s === "m" ? 14 : 17 }}>
                  A
                </span>
                <span className="text-xs capitalize">{FONT_SIZE_LABELS[s]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {/* bold */}
      <button
        aria-label="Bold"
        aria-pressed={part.bold}
        onClick={() => api.updatePart(part.id, { bold: !part.bold })}
        className="min-h-8 shrink-0 rounded-md px-2.5 py-1 text-xs font-bold"
        style={chip(part.bold)}
      >
        B
      </button>
      {/* underline */}
      <button
        aria-label="Underline"
        aria-pressed={!!part.underline}
        onClick={() => api.updatePart(part.id, { underline: !part.underline })}
        className="min-h-8 shrink-0 rounded-md px-2.5 py-1 text-xs"
        style={{ ...chip(!!part.underline), textDecoration: "underline" }}
      >
        U
      </button>

      {divider}

      {/* duplicate */}
      <button
        aria-label="Duplicate part"
        title="Duplicate"
        className={`${iconBtn} shrink-0`}
        style={{ color: "var(--ink-soft)" }}
        onClick={() => api.duplicatePart(part.id)}
      >
        <DuplicateIcon />
      </button>
      {/* lock */}
      <button
        aria-label={part.locked ? "Unlock part" : "Lock part"}
        aria-pressed={!!part.locked}
        title={part.locked ? "Unlock" : "Lock"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
        style={chip(!!part.locked)}
        onClick={() => api.updatePart(part.id, { locked: !part.locked })}
      >
        <LockIcon locked={!!part.locked} />
      </button>
      {/* delete (confirm inline) */}
      {confirmDelete ? (
        <div className="flex shrink-0 items-center gap-1">
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
            className="min-h-8 rounded-md px-2 py-1 text-xs"
            style={{ color: "var(--ink-soft)" }}
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          aria-label="Delete part"
          title="Delete"
          className={`${iconBtn} shrink-0`}
          style={{ color: "var(--danger)" }}
          onClick={() => setConfirmDelete(true)}
        >
          <TrashIcon />
        </button>
      )}

      {divider}

      {/* location (dropdown) — the same searchable region picker the phone
          sheet uses; a native <datalist> was unusable here on PC. */}
      <div className="relative shrink-0">
        <button
          aria-label="Location"
          title="Location"
          aria-expanded={openPop === "location"}
          className={iconBtn}
          style={{ color: "var(--ink-soft)" }}
          onClick={() => setOpenPop((p) => (p === "location" ? null : "location"))}
        >
          <PinIcon />
        </button>
        {openPop === "location" && (
          <div
            className="fade-in absolute right-0 top-full z-20 mt-1 w-[264px] rounded-xl p-3"
            style={cardStyle}
          >
            <LocationPicker part={part} onDone={() => setOpenPop(null)} />
          </div>
        )}
      </div>

      {/* overflow: shape / note / draw-arrow */}
      <div className="relative shrink-0">
        <button
          aria-label="More options"
          aria-expanded={openPop === "more"}
          className={iconBtn}
          style={{ color: "var(--ink-soft)" }}
          onClick={() => setOpenPop((p) => (p === "more" ? null : "more"))}
        >
          <MoreIcon />
        </button>
        {openPop === "more" && (
          <div
            className="fade-in absolute right-0 top-full z-20 mt-1 flex w-[248px] flex-col gap-2.5 rounded-xl p-3"
            style={cardStyle}
          >
            <div>
              <div className="pb-1 text-[11px]" style={{ color: "var(--ink-faint)" }}>
                Shape
              </div>
              <div className="flex gap-1">
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
                    className="min-h-8 flex-1 rounded-md px-2 py-1 text-xs"
                    style={chip(part.shape === shape)}
                  >
                    {glyph}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="pb-1 text-[11px]" style={{ color: "var(--ink-faint)" }}>
                Note
              </div>
              <NoteField part={part} />
            </div>
            <ConnectField part={part} />
          </div>
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
      tourId="edit-sheet"
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
                className="shrink-0 rounded-full px-3 py-2 text-xs transition-opacity active:opacity-70 pointer-coarse:min-h-10"
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
            <div className="flex justify-between gap-1 pb-2.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  aria-label={`Color: ${PALETTE_NAMES[c] ?? c}`}
                  aria-pressed={p.color === c}
                  onClick={() => api.updatePart(p.id, { color: c })}
                  // min-w-0 shrink: 8 fixed 40px swatches + sheet padding
                  // overflow a 320px screen — ideal size, allowed to give.
                  className="flex h-10 w-10 min-w-0 shrink items-center justify-center rounded-full active:bg-black/10"
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
            <div className="flex items-center gap-1.5 pb-1.5">
              {(["s", "m", "l"] as const).map((s) => (
                <button
                  key={s}
                  aria-label={`Text size: ${FONT_SIZE_LABELS[s]}`}
                  aria-pressed={p.fontSize === s}
                  onClick={() => api.updatePart(p.id, { fontSize: s })}
                  className={`min-h-10 flex-1 rounded-lg ${pressScale}`}
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
                className={`min-h-10 flex-1 rounded-lg text-sm font-bold ${pressScale}`}
                style={chip(p.bold)}
              >
                B
              </button>
              <button
                aria-label="Underline"
                aria-pressed={!!p.underline}
                onClick={() => api.updatePart(p.id, { underline: !p.underline })}
                className={`min-h-10 flex-1 rounded-lg text-sm ${pressScale}`}
                style={{ ...chip(!!p.underline), textDecoration: "underline" }}
              >
                U
              </button>
            </div>
            {/* Shapes get their own row: nine controls in one row shrank
                to ~25px targets on 320px phones. */}
            <div className="flex items-center gap-1.5 pb-2.5">
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
                  className={`min-h-10 flex-1 rounded-lg text-sm ${pressScale}`}
                  style={chip(p.shape === shape)}
                >
                  {glyph}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 pb-2.5">
              <button
                aria-label={`Duplicate “${p.name}”`}
                onClick={() => {
                  api.duplicatePart(p.id);
                  onClose();
                }}
                className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs ${pressScale}`}
                style={chip(false)}
              >
                <DuplicateIcon /> Duplicate
              </button>
              <button
                aria-label={p.locked ? "Unlock part" : "Lock part"}
                aria-pressed={!!p.locked}
                onClick={() => api.updatePart(p.id, { locked: !p.locked })}
                className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs ${pressScale}`}
                style={chip(!!p.locked)}
              >
                <LockIcon locked={!!p.locked} /> {p.locked ? "Locked" : "Lock"}
              </button>
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
                  className="min-h-10 shrink-0 rounded-lg px-3.5 text-xs transition-opacity active:opacity-75"
                  style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
                >
                  delete
                </button>
                <button
                  aria-label="Cancel delete"
                  onClick={() => setConfirmDeleteFor(null)}
                  className="min-h-10 shrink-0 rounded-lg px-3.5 text-xs active:bg-black/10"
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
                  className="flex min-h-10 flex-1 items-center justify-between rounded-lg px-3 text-left text-sm transition-opacity active:opacity-70"
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
                        className="min-h-10 px-3 text-[11px] uppercase tracking-wide transition-opacity active:opacity-80"
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
                  // Denied while the tour's edit step allows the rest of
                  // the sheet — deleting the freshly made part would
                  // strand the arrow step with one part.
                  data-tour-deny
                  onClick={() => setConfirmDeleteFor(p.id)}
                  className="ml-auto min-h-10 shrink-0 rounded-lg px-3.5 text-xs transition-opacity active:opacity-75"
                  style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
                >
                  delete
                </button>
              </div>
            )}
            <div className="pt-2.5">
              <ConnectField
                part={p}
                sheet
                onPicked={() => {
                  flushPending();
                  onClose();
                }}
              />
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
