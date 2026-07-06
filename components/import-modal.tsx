"use client";

/* ════════════════════════════════════════════════════════════════════
   IMPORT MODAL — paste a list of parts, one per line
   ════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { panelStyle } from "@/lib/ui";

export function ImportModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (text: string) => void;
}) {
  const [text, setText] = useState("");
  if (!open) return null;
  return (
    <div
      data-ui-chrome
      className="absolute inset-0 z-30 flex items-start justify-center p-4 pt-14 sm:items-center sm:pt-4"
      style={{ background: "rgba(58,55,51,0.18)" }}
      onClick={onClose}
    >
      <div
        className="fade-in w-full max-w-md rounded-2xl p-4"
        style={{ ...panelStyle, background: "#FDFCFA" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-medium">Import parts</h2>
        <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          One part per line. Optionally add a location after a comma or tab —
          e.g. <span className="font-mono">Protector, solar plexus</span>.
          Anything unmatched lands in free space below the figure, ready to
          place.
        </p>
        <textarea
          className="mt-3 w-full resize-none rounded-xl p-3 text-sm outline-none"
          style={{ background: "rgba(255,255,255,0.8)", border: "1px solid var(--line)" }}
          rows={6}
          autoFocus
          placeholder={"Inner Critic\tforehead\nAnxious One, stomach\nThe Watcher, behind me"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            className="rounded-lg px-3 py-1.5 text-xs hover:bg-black/5"
            style={{ color: "var(--ink-soft)" }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rounded-lg px-3 py-1.5 text-xs text-white hover:opacity-90"
            style={{ background: "var(--accent)" }}
            onClick={() => {
              onImport(text);
              setText("");
              onClose();
            }}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
