"use client";

/* ════════════════════════════════════════════════════════════════════
   PART EDITOR — the same editor in both layouts: desktop floating
   popover + phone bottom sheet, sharing the name/note/location fields
   ════════════════════════════════════════════════════════════════════ */

import React, { useRef, useState } from "react";
import { PALETTE } from "@/lib/tuning";
import { REGION_BY_KEY } from "@/lib/regions";
import type { Part } from "@/lib/types";
import { locationDisplay, partSurface } from "@/lib/part-utils";
import { panelStyle } from "@/lib/ui";
import { useAppApi } from "@/hooks/use-app-api";

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

/** Editable, text-authoritative location field (shared by popover, list
 *  and phone sheet). */
export function LocationField({
  part,
  compact,
  sheet,
}: {
  part: Part;
  compact?: boolean;
  sheet?: boolean;
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

  return (
    <input
      className={`nodrag nopan rounded-md px-2 outline-none transition-shadow ${
        sheet
          ? "w-full py-2 text-sm"
          : compact
            ? "w-full py-0.5 text-[11px]"
            : "w-44 py-1 text-xs"
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

/** Lean Miro-style card editor: color, size, bold, shape, location, delete. */
export function EditPopover({ part }: { part: Part }) {
  const api = useAppApi();
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
            aria-label={`Color ${c}`}
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
            aria-label={`Shape ${shape}`}
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
      <div className="flex w-full items-center gap-2">
        <LocationField part={part} />
        <button
          aria-label="Delete part"
          onClick={() => api.deletePart(part.id)}
          className="ml-auto min-h-8 rounded-md px-2.5 py-1 text-xs"
          style={{ color: "#A05B5B", background: "rgba(192,138,138,0.12)" }}
        >
          delete
        </button>
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y0: number; dy: number } | null>(null);
  if (!p) return null;

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

  // Swipe-to-dismiss: the grab strip follows the finger (down only);
  // past the threshold the sheet is put away, otherwise it springs home.
  const onGrabDown = (e: React.PointerEvent) => {
    dragRef.current = { y0: e.clientY, dy: 0 };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  };
  const onGrabMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${d.dy}px)`;
    }
  };
  const onGrabUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    const s = sheetRef.current;
    if (!s) return;
    s.style.transition = "";
    s.style.transform = "";
    if (d && d.dy > 80) onClose();
  };

  return (
    <div
      ref={sheetRef}
      data-ui-chrome
      className="absolute inset-x-0 bottom-0 z-30 rounded-t-3xl px-4 sm:hidden"
      style={{
        ...panelStyle,
        boxShadow: "0 -8px 32px rgba(60, 50, 40, 0.16)",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        transform: open ? "translateY(0)" : "translateY(112%)",
        transition: "transform 320ms cubic-bezier(0.32, 0.72, 0.22, 1)",
        touchAction: "manipulation",
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {/* grab strip — the whole top edge is the swipe handle */}
      <div
        className="-mx-4 flex cursor-grab justify-center pb-1 pt-2"
        style={{ touchAction: "none" }}
        onPointerDown={onGrabDown}
        onPointerMove={onGrabMove}
        onPointerUp={onGrabUp}
        onPointerCancel={onGrabUp}
      >
        <div
          className="h-1.5 w-10 rounded-full"
          style={{ background: "var(--line)" }}
        />
      </div>
      <div className="flex items-center gap-2 pb-2.5">
        <NameField part={p} sheet />
        <button
          aria-label="Done editing"
          className="shrink-0 rounded-full px-3 py-2 text-xs"
          style={{ background: "rgba(0,0,0,0.05)", color: "var(--ink-soft)" }}
          onClick={onClose}
        >
          Done
        </button>
      </div>
      <div className="flex justify-between pb-2.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            aria-label={`Color ${c}`}
            onClick={() => api.updatePart(p.id, { color: c })}
            className="flex h-10 w-10 items-center justify-center rounded-full"
          >
            <span
              className="h-7 w-7 rounded-full"
              style={{
                background: c,
                border: "1px solid rgba(58,55,51,0.18)",
                outline: p.color === c ? "2px solid var(--ink-soft)" : "none",
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
            aria-label={`Text size ${s}`}
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
          onClick={() => api.updatePart(p.id, { bold: !p.bold })}
          className="min-h-10 flex-1 rounded-lg text-sm font-bold"
          style={chip(p.bold)}
        >
          B
        </button>
        <div className="mx-1 h-6 w-px" style={{ background: "var(--line)" }} />
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
            aria-label={`Shape ${shape}`}
            onClick={() => api.updatePart(p.id, { shape })}
            className="min-h-10 flex-1 rounded-lg text-sm"
            style={chip(p.shape === shape)}
          >
            {glyph}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <LocationField part={p} sheet />
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
          onClick={() => {
            api.deletePart(p.id);
            onClose();
          }}
          className="ml-auto min-h-10 shrink-0 rounded-lg px-3.5 text-xs"
          style={{ color: "#A05B5B", background: "rgba(192,138,138,0.12)" }}
        >
          delete
        </button>
      </div>
      <div className="pt-2.5">
        <NoteField part={p} sheet />
      </div>
    </div>
  );
}
