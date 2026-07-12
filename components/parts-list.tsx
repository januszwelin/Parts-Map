"use client";

/* ════════════════════════════════════════════════════════════════════
   PARTS LIST — the desktop side panel and the phone bottom sheet, fed
   by the same rows, filter, and copy/export actions
   ════════════════════════════════════════════════════════════════════ */

import React, { useEffect, useRef, useState } from "react";
import type { Arrow, Part, Depth, Shape } from "@/lib/types";
import { partIsBack, locationDisplay } from "@/lib/part-utils";
import { cardStyle } from "@/lib/ui";
import {
  copyText,
  mapText,
  shareText,
  shareFlowchartPng,
  shareMapPng,
  downloadFlowchartPng,
  downloadMapPng,
} from "@/lib/exports";
import { useReducedMotion } from "@/hooks/use-media";
import { BottomSheet } from "@/components/bottom-sheet";
import { Icon, PATHS } from "@/components/phone-sheets";
import { EllipsisIcon, CloseIcon, SearchIcon } from "@/components/icons";
import { BODY_PATHS } from "@/lib/body-paths";

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
 *  buttons sitting bare in the panel used to read as loose, unrelated
 *  chrome ("feels out of place"); one quiet trigger with a panelStyle
 *  dropdown reads as a single, intentional feature. DESKTOP ONLY: a
 *  floating dropdown off a short bottom-anchored sheet ran past the
 *  screen edge on phones — the phone sheet swaps its body to
 *  `ListOptions` instead. `onOpenChange` is a hook for the tour
 *  (coach-marks) to notice the menu opening — optional, unused outside
 *  that. */
function ExportMenu({
  parts,
  arrows,
  bodyScale,
  view,
  onOpenChange,
  onNotice,
  onSaveJson,
  onLoadJson,
  dirty,
}: {
  parts: Part[];
  arrows: Arrow[];
  bodyScale: number;
  view: Depth;
  onOpenChange?: (open: boolean) => void;
  /** Failures used to be silent — the button just did nothing, which reads
   *  as broken rather than as "that didn't work." Mobile in-app browsers
   *  (Instagram/Slack webviews, etc.) are exactly where the clipboard
   *  fallback is most likely to actually fail. */
  onNotice?: (text: string) => void;
  /** JSON save/load — the real, reloadable format. Now lives here (the
   *  toolbar's primary Save exports an image instead). Desktop only; the
   *  phone keeps these in the Share sheet to avoid two homes for the same
   *  action. When present, a divider + "Save JSON"/"Load JSON" appear. */
  onSaveJson?: () => void;
  onLoadJson?: (file: File) => void;
  /** Unsaved-changes cue for the JSON save row + the ⋯ trigger dot. */
  dirty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const showJson = !!onSaveJson && !!onLoadJson;
  const [copied, setCopied] = useState<"text" | "flow" | "map" | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  useEffect(() => {
    onOpenChangeRef.current?.(open);
  }, [open]);
  // Click-outside via a document listener, not a fixed-inset catcher: the
  // desktop panel's translate-x and panelStyle's backdrop-filter both make
  // ancestors containing blocks, so `fixed inset-0` only covered the panel
  // and canvas clicks never closed the menu.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const flash = (kind: "text" | "flow" | "map") => {
    setCopied(kind);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 1400);
  };
  const copyAll = async () => {
    if (!(await copyText(mapText(parts, arrows)))) {
      onNotice?.("Couldn't copy — your browser may be blocking clipboard access.");
      return;
    }
    flash("text");
  };
  const exportFlow = async () => {
    if (!(await downloadFlowchartPng(parts, arrows))) {
      onNotice?.("Couldn't export the flowchart image.");
      return;
    }
    flash("flow");
  };
  const exportMap = async () => {
    if (!(await downloadMapPng(parts, arrows, bodyScale, view))) {
      onNotice?.("Couldn't export the map image.");
      return;
    }
    flash("map");
  };

  const rowCls =
    "flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-black/5 disabled:opacity-40";

  return (
    <div className="relative" ref={menuRef}>
      <button
        data-tour="export-menu"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/5 active:bg-black/10 pointer-coarse:h-10 pointer-coarse:w-10"
        style={{ color: "var(--ink-soft)" }}
        title={showJson && dirty ? "Unsaved changes — Save JSON in this menu" : undefined}
      >
        <EllipsisIcon />
        {showJson && dirty && (
          <span
            aria-hidden
            className="absolute right-0.5 top-0.5 inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--accent)" }}
          />
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="fade-in absolute right-0 top-full z-20 mt-1 w-48 rounded-xl p-1.5"
          style={cardStyle}
        >
          <button
            role="menuitem"
            className={rowCls}
            style={{ color: "var(--ink-soft)" }}
            onClick={copyAll}
            disabled={!parts.length}
            title="Copy the whole map as text — parts, locations, notes, relationships"
          >
            <span aria-live="polite">
              {copied === "text" ? "copied ✓" : "copy as text"}
            </span>
          </button>
          <button
            role="menuitem"
            className={rowCls}
            style={{ color: "var(--ink-soft)" }}
            onClick={exportFlow}
            disabled={!arrows.length}
            title="Download all arrows as a flowchart image"
          >
            <span aria-live="polite">
              {copied === "flow" ? "exported ✓" : "export flowchart"}
            </span>
          </button>
          <button
            role="menuitem"
            className={rowCls}
            style={{ color: "var(--ink-soft)" }}
            onClick={exportMap}
            disabled={!parts.length}
            title="Download the body map, with every part in its real position"
          >
            <span aria-live="polite">
              {copied === "map" ? "exported ✓" : "export map image"}
            </span>
          </button>
          {showJson && (
            <>
              <div className="my-1 h-px" style={{ background: "var(--line)" }} />
              <button
                role="menuitem"
                className={rowCls}
                style={{ color: "var(--ink-soft)" }}
                onClick={() => {
                  setOpen(false);
                  onSaveJson!();
                }}
                title="Save the map as a reloadable JSON file"
              >
                <span className="flex-1">Save JSON</span>
                {dirty && (
                  <span
                    aria-hidden
                    className="ml-2 inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                )}
              </button>
              <button
                role="menuitem"
                className={rowCls}
                style={{ color: "var(--ink-soft)" }}
                onClick={() => fileRef.current?.click()}
                title="Open a previously saved JSON map"
              >
                Load JSON
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onLoadJson!(f);
                  e.target.value = "";
                  setOpen(false);
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** One list row, two dialects, both quiet two-line targets: name over a
 *  muted location line. Desktop gains a hover "show on map" affordance;
 *  location editing lives in the part's editor (popover / edit sheet),
 *  never inline in a row. */

/** Desktop rows carry a miniature of the card's shape — the list echoes
 *  the canvas (SHAPE_RADIUS's proportions at swatch scale). */
const SWATCH_STYLE: Record<Shape, React.CSSProperties> = {
  rounded: { width: 11, height: 11, borderRadius: 3.5 },
  square: { width: 11, height: 11, borderRadius: 2 },
  pill: { width: 13, height: 8, borderRadius: 999 },
  ellipse: { width: 13, height: 9, borderRadius: "50%" },
};

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
      role="img"
      aria-label="has a note"
      title={p.note}
      className="h-1 w-1 shrink-0 rounded-full"
      style={{ background: "var(--ink-faint)", opacity: 0.8 }}
    />
  ) : null;
  const backBadge = partIsBack(p) ? (
    <span
      className="shrink-0 rounded-full px-1.5 text-[10px]"
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
        className="flex min-h-12 w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors active:bg-black/10"
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
    <button
      data-part-row={p.id}
      title="Show on map"
      onClick={onTap}
      className="group relative mb-0.5 flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-black/5"
      style={{ background: rowBg }}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute left-1 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full"
          style={{ background: "var(--accent)" }}
        />
      )}
      <span className="mt-0.75 flex h-3 w-3.5 shrink-0 items-center justify-center">
        <span
          className="block"
          style={{
            ...SWATCH_STYLE[p.shape],
            background: p.color,
            border: "1px solid rgba(58,55,51,0.2)",
          }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs" style={{ color: "var(--ink)" }}>
            {p.name}
          </span>
          {noteDot}
        </span>
        <span
          className="block truncate text-[11px] leading-4"
          style={{ color: "var(--ink-faint)" }}
        >
          {locationDisplay(p)}
        </span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1 pt-0.5">
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
  );
}

export function PartsListPanel({
  parts,
  arrows,
  bodyScale,
  view,
  open,
  selectedId,
  onSelect,
  onReveal,
  onClose,
  onExportMenuOpenChange,
  onNotice,
  onSaveJson,
  onLoadJson,
  dirty,
}: {
  parts: Part[];
  arrows: Arrow[];
  bodyScale: number;
  view: Depth;
  open: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Glide the camera to the part (the row's "where is it?"). */
  onReveal: (id: string) => void;
  onClose: () => void;
  /** The tour's hook into the "⋯" menu opening — optional. */
  onExportMenuOpenChange?: (open: boolean) => void;
  onNotice?: (text: string) => void;
  /** JSON save/load — surfaced in the ⋯ menu on desktop. */
  onSaveJson?: () => void;
  onLoadJson?: (file: File) => void;
  dirty?: boolean;
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
      className={`absolute bottom-[calc(72px+env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] top-3 z-10 flex w-[min(264px,78vw)] flex-col rounded-xl transition-transform duration-300 ease-out motion-reduce:transition-none sm:bottom-3 sm:top-[68px] ${
        open ? "translate-x-0" : "-translate-x-[120%]"
      }`}
      style={cardStyle}
    >
      <div
        className="flex items-center justify-between py-2 pl-3.5 pr-2"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <span
          className="flex items-center gap-1.5 text-sm font-medium"
          style={{ color: "var(--ink-soft)" }}
        >
          Parts
          <span
            className="rounded-full bg-black/4 px-1.5 py-0.5 text-[10px] leading-none tabular-nums"
            style={{ color: "var(--ink-faint)" }}
          >
            {parts.length}
          </span>
        </span>
        <div className="flex items-center gap-0.5">
          <ExportMenu
            parts={parts}
            arrows={arrows}
            bodyScale={bodyScale}
            view={view}
            onOpenChange={onExportMenuOpenChange}
            onNotice={onNotice}
            onSaveJson={onSaveJson}
            onLoadJson={onLoadJson}
            dirty={dirty}
          />
          <button
            aria-label="Close list"
            title="Close list"
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/5 active:bg-black/10 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            style={{ color: "var(--ink-faint)" }}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
      </div>
      {parts.length > 8 && (
        <div className="px-3 pb-1 pt-2">
          <div className="relative">
            <span
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2"
              style={{ color: "var(--ink-faint)" }}
            >
              <SearchIcon />
            </span>
            <input
              className="w-full rounded-lg bg-black/3 py-1.5 pl-8 pr-2 text-xs outline-none transition-colors focus:bg-black/5"
              style={{ color: "var(--ink)" }}
              value={query}
              placeholder="Find a part…"
              aria-label="Filter parts"
              enterKeyHint="search"
              inputMode="search"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      )}
      <div ref={rowsRef} className="flex-1 select-text overflow-y-auto px-2 py-2">
        {parts.length === 0 && (
          <div className="flex flex-col items-center gap-2.5 px-2 py-6">
            <svg
              viewBox="0 0 460 1000"
              width="24"
              height="52"
              aria-hidden
              style={{ opacity: 0.45 }}
            >
              {BODY_PATHS.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke="var(--ink-faint)"
                  strokeWidth={18}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </svg>
            <p className="text-center text-[11px]" style={{ color: "var(--ink-faint)" }}>
              No parts yet. Name one above, or Import a list.
            </p>
          </div>
        )}
        {parts.length > 0 && shown.length === 0 && (
          <p className="px-2 py-4 text-center text-[11px]" style={{ color: "var(--ink-faint)" }}>
            Nothing matches “{query.trim()}”.
          </p>
        )}
        {(() => {
          const row = (p: Part) => (
            <PartRow
              key={p.id}
              part={p}
              selected={p.id === selectedId}
              onTap={() => {
                onSelect(p.id);
                onReveal(p.id);
              }}
            />
          );
          // Mixed maps read by surface; small single-surface maps (and
          // search results) stay flat, exactly as before.
          const grouped = !query.trim()
            ? (
                [
                  ["Front", shown.filter((p) => !p.offBody && !partIsBack(p))],
                  ["Back", shown.filter((p) => !p.offBody && partIsBack(p))],
                  ["Off body", shown.filter((p) => p.offBody)],
                ] as const
              ).filter(([, rows]) => rows.length > 0)
            : null;
          if (grouped && grouped.length > 1)
            return grouped.map(([name, rows]) => (
              <div key={name} className="mb-1">
                <div
                  className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {name}
                </div>
                {rows.map(row)}
              </div>
            ));
          return shown.map(row);
        })()}
      </div>
    </div>
  );
}

/** Phone parts list — a bottom sheet in the same language as the edit
 *  sheet (grab strip, swipe to put away). Rows reveal rather than select:
 *  the sheet slides out of the way so the camera glide and reveal halo
 *  play unobstructed. */
/** The list sheet's second page — Copy & export as full-width rows behind
 *  a ‹ back, swapped into the sheet body in place (LocationPicker's
 *  pattern). Replaces the desktop ⋯ dropdown here, which opened downward
 *  off a short bottom-anchored sheet and ran past the screen edge.
 *  Outcomes speak inline on the row itself — success and failure — so no
 *  floating toast ever covers a sibling row. */
function ListOptions({
  parts,
  arrows,
  bodyScale,
  view,
  onBack,
  onClose,
}: {
  parts: Part[];
  arrows: Arrow[];
  bodyScale: number;
  view: Depth;
  onBack: () => void;
  onClose: () => void;
}) {
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
  // Share outcomes → row flash; null = the person closed the OS share
  // sheet themselves, which deserves silence, not feedback.
  const shareOutcome = (
    s: "shared" | "copied" | "downloaded" | "cancelled" | "failed",
  ) =>
    s === "cancelled"
      ? null
      : s === "failed"
        ? { ok: false, text: "Couldn't share" }
        : {
            ok: true,
            text:
              s === "shared"
                ? "Shared ✓"
                : s === "copied"
                  ? "Copied ✓"
                  : "Downloaded ✓",
          };
  const exportOutcome = (ok: boolean) => ({
    ok,
    text: ok ? "Exported ✓" : "Couldn't export",
  });
  const actions: {
    id: string;
    icon: string;
    base: string;
    disabled: boolean;
    run: () => Promise<{ ok: boolean; text: string } | null>;
  }[] = [
    {
      id: "text",
      icon: PATHS.share,
      base: "Share as text",
      disabled: !parts.length,
      run: async () => shareOutcome(await shareText(mapText(parts, arrows))),
    },
    {
      id: "smap",
      icon: PATHS.share,
      base: "Share map image",
      disabled: !parts.length,
      run: async () =>
        shareOutcome(await shareMapPng(parts, arrows, bodyScale, view)),
    },
    {
      id: "sflow",
      icon: PATHS.share,
      base: "Share flowchart",
      disabled: !arrows.length,
      run: async () => shareOutcome(await shareFlowchartPng(parts, arrows)),
    },
    {
      id: "map",
      icon: PATHS.image,
      base: "Export map image",
      disabled: !parts.length,
      run: async () =>
        exportOutcome(await downloadMapPng(parts, arrows, bodyScale, view)),
    },
    {
      id: "flow",
      icon: PATHS.flow,
      base: "Export flowchart",
      disabled: !arrows.length,
      run: async () => exportOutcome(await downloadFlowchartPng(parts, arrows)),
    },
  ];
  return (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      <div className="flex items-center gap-2 pb-1.5">
        <button
          aria-label="Back to the list"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base transition-opacity active:opacity-70 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          style={{ background: "rgba(0,0,0,0.05)", color: "var(--ink-soft)" }}
          onClick={onBack}
        >
          ‹
        </button>
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium"
          style={{ color: "var(--ink-soft)" }}
        >
          Copy & export
        </span>
        <button
          aria-label="Close list"
          className="shrink-0 rounded-full px-3 py-2 text-xs transition-opacity active:opacity-70 pointer-coarse:min-h-11"
          style={{ background: "rgba(0,0,0,0.05)", color: "var(--ink-soft)" }}
          onClick={onClose}
        >
          Done
        </button>
      </div>
      {actions.map((a) => (
        <button
          key={a.id}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 py-3 text-left text-sm transition-colors hover:bg-black/5 active:bg-black/10 disabled:opacity-40"
          style={
            flash?.id === a.id && !flash.ok
              ? { color: "var(--danger)" }
              : { color: "var(--ink-soft)" }
          }
          disabled={a.disabled}
          onClick={async () => {
            const r = await a.run();
            if (r) mark(a.id, r.ok, r.text);
          }}
        >
          <Icon d={a.icon} />
          <span aria-live="polite">
            {flash?.id === a.id ? flash.text : a.base}
          </span>
        </button>
      ))}
    </div>
  );
}

export function PhonePartsSheet({
  parts,
  arrows,
  bodyScale,
  view,
  open,
  autoFocusSearch,
  onReveal,
  onClose,
  onExportMenuOpenChange,
}: {
  parts: Part[];
  arrows: Arrow[];
  bodyScale: number;
  view: Depth;
  open: boolean;
  /** Focus the filter as the sheet arrives — set when opened via the
   *  top-bar search rather than the list button. */
  autoFocusSearch?: boolean;
  onReveal: (id: string) => void;
  onClose: () => void;
  /** The tour's hook into the "⋯" options opening — optional. */
  onExportMenuOpenChange?: (open: boolean) => void;
}) {
  const { query, setQuery, shown } = useListQuery(parts, open);
  const searchRef = useRef<HTMLInputElement>(null);
  // The ⋯ options page, swapped into the sheet body in place. Resets when
  // the sheet is put away — through the same seam the ⋯ button reports on,
  // so the app-level exportMenuOpen can't stick true after a close (a
  // render-time reset here once bypassed the callback and made a re-run
  // tour's list step auto-complete).
  const [optionsOpen, setOptionsOpen] = useState(false);
  const showOptions = (v: boolean) => {
    setOptionsOpen(v);
    // The tour's "list" step completes when the options open — same
    // reporting seam the old dropdown drove.
    onExportMenuOpenChange?.(v);
  };
  const wasOpenRef = useRef(open);
  useEffect(() => {
    if (wasOpenRef.current && !open && optionsOpen) {
      setOptionsOpen(false);
      onExportMenuOpenChange?.(false);
    }
    wasOpenRef.current = open;
  }, [open, optionsOpen, onExportMenuOpenChange]);
  useEffect(() => {
    if (open && autoFocusSearch) {
      const t = setTimeout(() => searchRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open, autoFocusSearch]);

  return (
    <BottomSheet open={open} onClose={onClose} label={`Parts (${parts.length})`}>
      {optionsOpen ? (
        <ListOptions
          parts={parts}
          arrows={arrows}
          bodyScale={bodyScale}
          view={view}
          onBack={() => showOptions(false)}
          onClose={onClose}
        />
      ) : (
        <>
          <div className="flex shrink-0 items-center justify-between pb-2">
            <span className="text-sm font-medium" style={{ color: "var(--ink-soft)" }}>
              Parts ({parts.length})
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                data-tour="export-menu"
                aria-label="Copy & export options"
                aria-expanded={optionsOpen}
                className="flex h-9 w-9 items-center justify-center rounded-full text-base hover:bg-black/5 active:bg-black/10 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                style={{ color: "var(--ink-soft)" }}
                onClick={() => showOptions(true)}
              >
                ⋯
              </button>
              <button
                aria-label="Close list"
                className="shrink-0 rounded-full px-3 py-2 text-xs transition-opacity active:opacity-70 pointer-coarse:min-h-11"
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
                ref={searchRef}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.7)",
                  border: "1px solid var(--line)",
                  color: "var(--ink)",
                }}
                value={query}
                placeholder="find a part…"
                aria-label="Filter parts"
                enterKeyHint="search"
                inputMode="search"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
          <div className="-mx-1.5 flex-1 overflow-y-auto overscroll-contain">
            {parts.length === 0 && (
              <p className="px-2 py-6 text-center text-xs" style={{ color: "var(--ink-faint)" }}>
                No parts yet. Tap + to add one, or Import a list.
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
        </>
      )}
    </BottomSheet>
  );
}
