"use client";

/* ════════════════════════════════════════════════════════════════════
   TOOLBAR — add/import/save/load/body-scale/sound chrome, plus the
   floating frame-map button
   ════════════════════════════════════════════════════════════════════ */

import { useRef, useState } from "react";
import { MIN_SCALE, MAX_SCALE } from "@/lib/tuning";
import { panelStyle } from "@/lib/ui";

/** Tiny speaker glyph for the sound toggle — quiet wave when on, a
 *  soft × when off. Inline SVG, app convention. */
function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block" }}
      aria-hidden
    >
      <path d="M11 5 6 9H2v6h4l5 4V5Z" fill="currentColor" stroke="none" />
      {on ? (
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      ) : (
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      )}
    </svg>
  );
}

export function Toolbar(props: {
  onAdd: (name: string) => void;
  /** The name field lives in the parent so cancelling a tap-to-place
   *  can hand the typed name back to the input. */
  nameValue: string;
  onNameChange: (v: string) => void;
  onImportOpen: () => void;
  bodyScale: number;
  onBodyScale: (v: number) => void;
  autoScale: boolean;
  onAutoScale: (v: boolean) => void;
  onSave: () => void;
  onLoad: (file: File) => void;
  listOpen: boolean;
  onToggleList: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = () => {
    const n = props.nameValue.trim();
    if (!n) return;
    props.onAdd(n);
    props.onNameChange("");
  };
  const closePopovers = () => {
    setSheetOpen(false);
    setBodyOpen(false);
  };
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
    // Bottom-anchored thumb bar on phones; classic top bar from sm up.
    <div
      data-ui-chrome
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:bottom-auto sm:top-0 sm:p-3"
    >
      <div
        className="pointer-events-auto relative flex w-full max-w-full select-none flex-wrap items-center justify-center gap-x-2 gap-y-1.5 rounded-2xl px-2.5 py-2 sm:w-auto sm:px-3"
        style={{ ...panelStyle, touchAction: "manipulation" }}
      >
        {(sheetOpen || bodyOpen) && (
          <div className="fixed inset-0" onClick={closePopovers} />
        )}

        <button
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
          onClick={props.onSave}
        >
          Save
        </button>
        <button
          className={`${btn} hidden sm:block`}
          style={{ color: "var(--ink-soft)" }}
          onClick={() => fileRef.current?.click()}
        >
          Load
        </button>
        <button
          className={`${btn} hidden shrink-0 sm:block`}
          style={{ color: "var(--ink-soft)" }}
          aria-label="Sound"
          aria-pressed={props.soundOn}
          title={props.soundOn ? "Sound on" : "Sound off"}
          onClick={props.onToggleSound}
        >
          <SoundIcon on={props.soundOn} />
        </button>

        {/* ——— phone: body pill + overflow sheet ——— */}
        <button
          className={`${btn} shrink-0 sm:hidden`}
          style={{ color: "var(--ink-soft)" }}
          aria-label="Body size"
          onClick={() => {
            setSheetOpen(false);
            setBodyOpen((v) => !v);
          }}
        >
          body
        </button>
        <button
          className={`${btn} shrink-0 sm:hidden`}
          style={{ color: "var(--ink-soft)" }}
          aria-label="More actions"
          onClick={() => {
            setBodyOpen(false);
            setSheetOpen((v) => !v);
          }}
        >
          ⋯
        </button>

        {bodyOpen && (
          <div
            className="fade-in absolute bottom-full left-1/2 mb-2 flex w-[min(320px,88vw)] -translate-x-1/2 flex-col gap-2.5 rounded-2xl px-4 py-3 sm:hidden"
            style={{ ...panelStyle, touchAction: "manipulation" }}
          >
            <div className="flex items-center gap-3">{sliderAndAuto}</div>
          </div>
        )}
        {sheetOpen && (
          <div
            className="fade-in absolute bottom-full right-0 mb-2 flex w-36 flex-col rounded-2xl p-1.5 sm:hidden"
            style={{ ...panelStyle, touchAction: "manipulation" }}
          >
            <button
              className="rounded-lg px-3 py-2.5 text-left text-xs hover:bg-black/5"
              style={{ color: "var(--ink-soft)" }}
              onClick={() => {
                setSheetOpen(false);
                props.onImportOpen();
              }}
            >
              Import
            </button>
            <button
              className="rounded-lg px-3 py-2.5 text-left text-xs hover:bg-black/5"
              style={{ color: "var(--ink-soft)" }}
              onClick={() => {
                setSheetOpen(false);
                props.onSave();
              }}
            >
              Save
            </button>
            <button
              className="rounded-lg px-3 py-2.5 text-left text-xs hover:bg-black/5"
              style={{ color: "var(--ink-soft)" }}
              onClick={() => {
                setSheetOpen(false);
                fileRef.current?.click();
              }}
            >
              Load
            </button>
            <button
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs hover:bg-black/5"
              style={{ color: "var(--ink-soft)" }}
              aria-pressed={props.soundOn}
              onClick={props.onToggleSound}
            >
              <SoundIcon on={props.soundOn} />
              {props.soundOn ? "Sound on" : "Sound off"}
            </button>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onLoad(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

/** The way home. The canvas is endless and easy to get lost in, so the
 *  frame-map control is a standalone floating button — always in the same
 *  corner on both layouts, big enough to hit without looking. */
export function FrameMapButton({ onFrame }: { onFrame: () => void }) {
  return (
    <button
      data-ui-chrome
      aria-label="Frame the map"
      title="Frame the map"
      className="absolute bottom-[calc(76px+env(safe-area-inset-bottom))] right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-black/5 sm:bottom-10"
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
