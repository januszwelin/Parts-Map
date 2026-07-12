"use client";

/* ════════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS — a quiet reference card (desktop). Opened from
   the toolbar's Help menu or by pressing "?" on the canvas.
   ════════════════════════════════════════════════════════════════════ */

import { useRef } from "react";
import { cardStyle } from "@/lib/ui";
import { useFocusTrap } from "@/hooks/use-focus-trap";

function Key({ children }: { children: string }) {
  return (
    <kbd
      className="rounded-md px-1.5 py-0.5 text-[11px] leading-4"
      style={{
        background: "#fff",
        border: "1px solid var(--line)",
        color: "var(--ink-soft)",
        boxShadow: "0 1px 0 rgba(60,50,40,0.06)",
        fontFamily: "inherit",
      }}
    >
      {children}
    </kbd>
  );
}

function Row({ action, keys }: { action: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between gap-4 px-1 py-1.5">
      <span className="text-xs" style={{ color: "var(--ink)" }}>
        {action}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-[10px]" style={{ color: "var(--ink-faint)" }}>
                or
              </span>
            )}
            <Key>{k}</Key>
          </span>
        ))}
      </span>
    </div>
  );
}

export function ShortcutsModal({
  open,
  onClose,
  scrollPan,
}: {
  open: boolean;
  onClose: () => void;
  /** The live scroll pref — the wheel line tells the truth for THIS
   *  device's current setting. */
  scrollPan: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef);
  if (!open) return null;
  return (
    <div
      data-ui-chrome
      className="fade-in absolute inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(58,55,51,0.18)" }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="flex w-full max-w-sm flex-col rounded-2xl p-5"
        style={{ ...cardStyle, background: "#FDFCFA", maxHeight: "85dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2">
          <h2
            id="shortcuts-title"
            className="text-sm font-medium"
            style={{ color: "var(--ink)" }}
          >
            Keyboard shortcuts
          </h2>
          <button
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md text-xs hover:bg-black/5"
            style={{ color: "var(--ink-faint)" }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto">
          <Row action="Pan the canvas" keys={["Space + drag", "right-drag"]} />
          <Row
            action={scrollPan ? "Scroll to pan · Ctrl+scroll to zoom" : "Scroll to zoom"}
            keys={["wheel"]}
          />
          <Row action="Select parts (marquee)" keys={["drag empty canvas"]} />
          <Row action="Add / remove from selection" keys={["Ctrl + click", "Shift + drag"]} />
          <div className="my-1 h-px" style={{ background: "var(--line)" }} />
          <Row action="Add a part" keys={["Enter"]} />
          <Row action="Rename the selected part" keys={["Enter"]} />
          <Row action="Nudge the selected part" keys={["arrow keys"]} />
          <Row action="Flip front / back" keys={["F"]} />
          <Row action="Delete selected" keys={["Delete", "Backspace"]} />
          <div className="my-1 h-px" style={{ background: "var(--line)" }} />
          <Row action="Undo" keys={["Ctrl + Z"]} />
          <Row action="Redo" keys={["Ctrl + Shift + Z", "Ctrl + Y"]} />
          <Row action="Close / deselect" keys={["Esc"]} />
          <Row action="This card" keys={["?"]} />
        </div>
        <p
          className="pt-3 text-[11px] leading-relaxed"
          style={{ color: "var(--ink-faint)" }}
        >
          On a Mac, use ⌘ where Ctrl is shown.
        </p>
      </div>
    </div>
  );
}
