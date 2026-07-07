"use client";

/* ════════════════════════════════════════════════════════════════════
   PARTS LIST — the desktop side panel and the phone bottom sheet, fed
   by the same rows, filter, and copy/export actions
   ════════════════════════════════════════════════════════════════════ */

import React, { useEffect, useRef, useState } from "react";
import type { Arrow, Part } from "@/lib/types";
import { partIsBack, locationDisplay } from "@/lib/part-utils";
import { panelStyle } from "@/lib/ui";
import {
  copyText,
  relationshipsText,
  downloadFlowchartPng,
  downloadMapPng,
} from "@/lib/exports";
import { useReducedMotion } from "@/hooks/use-media";
import { LocationField } from "@/components/part-editor";

/** The list filter's state — only offered once the list is long enough to
 *  need it; clears itself whenever the list is put away. */
function useListQuery(parts: Part[], open: boolean) {
  const [query, setQuery] = useState("");
  const [lastOpen, setLastOpen] = useState(open);
  if (lastOpen !== open) {
    setLastOpen(open);
    if (!open) setQuery("");
  }
  const q = query.trim().toLowerCase();
  const shown = q
    ? parts.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          locationDisplay(p).toLowerCase().includes(q),
      )
    : parts;
  return { query, setQuery, shown };
}

/** The copy/export actions, tucked behind a "⋯" menu — three text
 *  buttons sitting bare in the panel/sheet used to read as loose,
 *  unrelated chrome ("feels out of place"); one quiet trigger with a
 *  panelStyle dropdown reads as a single, intentional feature. Shared by
 *  the desktop panel and the phone sheet (the caller places it in its
 *  own header). `onOpenChange` is a hook for the tour (coach-marks) to
 *  notice the menu opening — optional, unused outside that. */
function ExportMenu({
  parts,
  arrows,
  bodyScale,
  phone,
  onOpenChange,
  onNotice,
}: {
  parts: Part[];
  arrows: Arrow[];
  bodyScale: number;
  phone?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Failures used to be silent — the button just did nothing, which reads
   *  as broken rather than as "that didn't work." Mobile in-app browsers
   *  (Instagram/Slack webviews, etc.) are exactly where the clipboard
   *  fallback is most likely to actually fail. */
  onNotice?: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"list" | "rel" | "flow" | "map" | null>(
    null,
  );
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  useEffect(() => {
    onOpenChangeRef.current?.(open);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const flash = (kind: "list" | "rel" | "flow" | "map") => {
    setCopied(kind);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 1400);
  };
  const copy = async (kind: "list" | "rel") => {
    const text =
      kind === "list"
        ? parts
            .map(
              (p) =>
                `${p.name}\t${locationDisplay(p)}${p.note ? `\t${p.note}` : ""}`,
            )
            .join("\n")
        : relationshipsText(parts, arrows);
    if (!(await copyText(text))) {
      onNotice?.("Couldn't copy — your browser may be blocking clipboard access.");
      return;
    }
    flash(kind);
  };
  const exportFlow = async () => {
    if (!(await downloadFlowchartPng(parts, arrows))) {
      onNotice?.("Couldn't export the flowchart image.");
      return;
    }
    flash("flow");
  };
  const exportMap = async () => {
    if (!(await downloadMapPng(parts, arrows, bodyScale))) {
      onNotice?.("Couldn't export the map image.");
      return;
    }
    flash("map");
  };

  const rowCls = phone
    ? "flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm hover:bg-black/5 disabled:opacity-40"
    : "flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[11px] hover:bg-black/5 disabled:opacity-40";

  return (
    <div className="relative">
      <button
        data-tour="export-menu"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={
          phone
            ? "flex h-9 w-9 items-center justify-center rounded-full text-base hover:bg-black/5"
            : "flex h-7 w-7 items-center justify-center rounded-md text-sm hover:bg-black/5 pointer-coarse:h-9 pointer-coarse:w-9"
        }
        style={{ color: "var(--ink-soft)" }}
      >
        ⋯
      </button>
      {open && (
        <>
          {/* Click-outside catcher — sits under the menu, above everything else. */}
          <button
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            style={{ background: "transparent" }}
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="fade-in absolute right-0 top-full z-20 mt-1 w-48 rounded-xl p-1.5"
            style={panelStyle}
          >
            <button
              role="menuitem"
              className={rowCls}
              style={{ color: "var(--ink-soft)" }}
              onClick={() => copy("list")}
              disabled={!parts.length}
            >
              {copied === "list" ? "copied ✓" : "copy list"}
            </button>
            <button
              role="menuitem"
              className={rowCls}
              style={{ color: "var(--ink-soft)" }}
              onClick={() => copy("rel")}
              disabled={!arrows.length}
              title="Copy all arrows as a text flowchart"
            >
              {copied === "rel" ? "copied ✓" : "copy relationships"}
            </button>
            <button
              role="menuitem"
              className={rowCls}
              style={{ color: "var(--ink-soft)" }}
              onClick={exportFlow}
              disabled={!arrows.length}
              title="Download all arrows as a flowchart image"
            >
              {copied === "flow" ? "exported ✓" : "export flowchart"}
            </button>
            <button
              role="menuitem"
              className={rowCls}
              style={{ color: "var(--ink-soft)" }}
              onClick={exportMap}
              disabled={!parts.length}
              title="Download the body map, with every part in its real position"
            >
              {copied === "map" ? "exported ✓" : "export map image"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** One list row, two dialects: desktop keeps the inline location editor
 *  and gains a hover "show on map" affordance; phone is a single
 *  thumb-sized target with a read-only location line (editing lives in
 *  the edit sheet). */
function PartRow({
  part: p,
  selected,
  phone,
  onTap,
}: {
  part: Part;
  selected: boolean;
  phone?: boolean;
  onTap: () => void;
}) {
  const noteDot = p.note ? (
    <span
      title={p.note}
      className="h-1 w-1 shrink-0 rounded-full"
      style={{ background: "var(--ink-faint)", opacity: 0.8 }}
    />
  ) : null;
  const backBadge = partIsBack(p) ? (
    <span
      className="shrink-0 rounded-full px-1.5 text-[9px]"
      style={{
        border: "1px solid var(--line)",
        color: "var(--ink-faint)",
        lineHeight: "13px",
      }}
    >
      back
    </span>
  ) : null;
  const rowBg = selected ? "rgba(125,139,116,0.12)" : "transparent";

  if (phone) {
    return (
      <button
        data-part-row={p.id}
        className="flex min-h-12 w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors active:bg-black/5"
        style={{ background: rowBg }}
        onClick={onTap}
      >
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{
            background: p.color,
            border: "1px solid rgba(58,55,51,0.2)",
          }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm" style={{ color: "var(--ink)" }}>
            {p.name}
          </span>
          <span
            className="block truncate text-[11px]"
            style={{ color: "var(--ink-faint)" }}
          >
            {locationDisplay(p)}
          </span>
        </span>
        {noteDot}
        {backBadge}
      </button>
    );
  }
  return (
    <div
      data-part-row={p.id}
      className="mb-1 rounded-xl px-2 py-2 transition-colors"
      style={{ background: rowBg }}
    >
      <button
        className="group flex w-full items-center gap-2 text-left"
        title="Show on map"
        onClick={onTap}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            background: p.color,
            border: "1px solid rgba(58,55,51,0.2)",
          }}
        />
        <span className="truncate text-xs" style={{ color: "var(--ink)" }}>
          {p.name}
        </span>
        {noteDot}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <svg
            className="opacity-0 transition-opacity group-hover:opacity-100"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="var(--ink-faint)"
            strokeWidth="1.2"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="6" cy="6" r="2.6" />
            <path d="M6 0.8v1.7M6 9.5v1.7M0.8 6h1.7M9.5 6h1.7" />
          </svg>
          {backBadge}
        </span>
      </button>
      <div className="mt-1 pl-[18px]">
        <LocationField part={p} compact />
      </div>
    </div>
  );
}

export function PartsListPanel({
  parts,
  arrows,
  bodyScale,
  open,
  selectedId,
  onSelect,
  onReveal,
  onClose,
  onExportMenuOpenChange,
  onNotice,
}: {
  parts: Part[];
  arrows: Arrow[];
  bodyScale: number;
  open: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Glide the camera to the part (the row's "where is it?"). */
  onReveal: (id: string) => void;
  onClose: () => void;
  /** The tour's hook into the "⋯" menu opening — optional. */
  onExportMenuOpenChange?: (open: boolean) => void;
  onNotice?: (text: string) => void;
}) {
  const { query, setQuery, shown } = useListQuery(parts, open);
  const reducedMotion = useReducedMotion();
  // Canvas selection answers "where in my list": keep the selected row
  // in view while the panel is open.
  const rowsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !selectedId) return;
    rowsRef.current
      ?.querySelector(`[data-part-row="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({
        block: "nearest",
        behavior: reducedMotion ? "auto" : "smooth",
      });
  }, [open, selectedId, reducedMotion]);
  return (
    <div
      data-ui-chrome
      className={`absolute bottom-[calc(72px+env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] top-3 z-10 flex w-[min(264px,78vw)] flex-col rounded-2xl transition-transform duration-300 ease-out sm:bottom-3 sm:top-[68px] ${
        open ? "translate-x-0" : "-translate-x-[120%]"
      }`}
      style={panelStyle}
    >
      <div
        className="flex items-center justify-between px-3.5 py-2.5"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <span className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>
          Parts ({parts.length})
        </span>
        <div className="flex items-center gap-0.5">
          <ExportMenu
            parts={parts}
            arrows={arrows}
            bodyScale={bodyScale}
            onOpenChange={onExportMenuOpenChange}
            onNotice={onNotice}
          />
          <button
            aria-label="Close list"
            className="rounded-md px-2 py-1 text-[11px] hover:bg-black/5 pointer-coarse:min-h-9 pointer-coarse:min-w-9"
            style={{ color: "var(--ink-faint)" }}
            onClick={onClose}
          >
            ◂
          </button>
        </div>
      </div>
      {parts.length > 8 && (
        <div className="px-3 py-1.5" style={{ borderBottom: "1px solid var(--line)" }}>
          <input
            className="w-full rounded-md px-2 py-1 text-[11px] outline-none"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
            }}
            value={query}
            placeholder="find a part…"
            aria-label="Filter parts"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      <div ref={rowsRef} className="flex-1 select-text overflow-y-auto px-2 py-2">
        {parts.length === 0 && (
          <p className="px-2 py-4 text-center text-[11px]" style={{ color: "var(--ink-faint)" }}>
            No parts yet. Name one above, or Import a list.
          </p>
        )}
        {parts.length > 0 && shown.length === 0 && (
          <p className="px-2 py-4 text-center text-[11px]" style={{ color: "var(--ink-faint)" }}>
            Nothing matches “{query.trim()}”.
          </p>
        )}
        {shown.map((p) => (
          <PartRow
            key={p.id}
            part={p}
            selected={p.id === selectedId}
            onTap={() => {
              onSelect(p.id);
              onReveal(p.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Phone parts list — a bottom sheet in the same language as the edit
 *  sheet (grab strip, swipe to put away). Rows reveal rather than select:
 *  the sheet slides out of the way so the camera glide and reveal halo
 *  play unobstructed. */
export function PhonePartsSheet({
  parts,
  arrows,
  bodyScale,
  open,
  onReveal,
  onClose,
  onExportMenuOpenChange,
  onNotice,
}: {
  parts: Part[];
  arrows: Arrow[];
  bodyScale: number;
  open: boolean;
  onReveal: (id: string) => void;
  onClose: () => void;
  /** The tour's hook into the "⋯" menu opening — optional. */
  onExportMenuOpenChange?: (open: boolean) => void;
  onNotice?: (text: string) => void;
}) {
  const { query, setQuery, shown } = useListQuery(parts, open);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y0: number; dy: number } | null>(null);

  // Swipe-to-dismiss — same gesture as MobileEditSheet: the strip follows
  // the finger (down only); past the threshold the sheet is put away.
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
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-3xl px-4 sm:hidden"
      style={{
        ...panelStyle,
        boxShadow: "0 -8px 32px rgba(60, 50, 40, 0.16)",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        maxHeight: "62dvh",
        transform: open ? "translateY(0)" : "translateY(112%)",
        transition: "transform 320ms cubic-bezier(0.32, 0.72, 0.22, 1)",
        touchAction: "manipulation",
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {/* grab strip — the whole top edge is the swipe handle */}
      <div
        className="-mx-4 flex shrink-0 cursor-grab justify-center pb-1 pt-2"
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
      <div className="flex shrink-0 items-center justify-between pb-2">
        <span className="text-sm font-medium" style={{ color: "var(--ink-soft)" }}>
          Parts ({parts.length})
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <ExportMenu
            parts={parts}
            arrows={arrows}
            bodyScale={bodyScale}
            phone
            onOpenChange={onExportMenuOpenChange}
            onNotice={onNotice}
          />
          <button
            aria-label="Close list"
            className="shrink-0 rounded-full px-3 py-2 text-xs"
            style={{ background: "rgba(0,0,0,0.05)", color: "var(--ink-soft)" }}
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
      {parts.length > 8 && (
        <div className="shrink-0 pb-2">
          <input
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
            }}
            value={query}
            placeholder="find a part…"
            aria-label="Filter parts"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      <div className="-mx-1.5 flex-1 overflow-y-auto overscroll-contain">
        {parts.length === 0 && (
          <p className="px-2 py-6 text-center text-xs" style={{ color: "var(--ink-faint)" }}>
            No parts yet. Name one below, or Import a list.
          </p>
        )}
        {parts.length > 0 && shown.length === 0 && (
          <p className="px-2 py-6 text-center text-xs" style={{ color: "var(--ink-faint)" }}>
            Nothing matches “{query.trim()}”.
          </p>
        )}
        {shown.map((p) => (
          <PartRow
            key={p.id}
            part={p}
            phone
            selected={false}
            onTap={() => {
              onReveal(p.id);
              onClose();
            }}
          />
        ))}
      </div>
    </div>
  );
}
