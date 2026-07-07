"use client";

/* ════════════════════════════════════════════════════════════════════
   IMPORT MODAL — paste a list of parts, one per line
   ════════════════════════════════════════════════════════════════════ */

import { useRef, useState } from "react";
import { panelStyle } from "@/lib/ui";
import { useFocusTrap } from "@/hooks/use-focus-trap";

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
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef);
  if (!open) return null;
  return (
    <div
      data-ui-chrome
      className="absolute inset-0 z-30 flex items-start justify-center p-4 pt-14 sm:items-center sm:pt-4"
      style={{ background: "rgba(58,55,51,0.18)" }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
        className="fade-in flex w-full max-w-md flex-col rounded-2xl p-4"
        style={{ ...panelStyle, background: "#FDFCFA", maxHeight: "90dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="import-modal-title" className="shrink-0 text-sm font-medium">
          Import parts
        </h2>
        <p
          className="mt-1 shrink-0 text-[11px] leading-relaxed"
          style={{ color: "var(--ink-soft)" }}
        >
          One part per line. Optionally add a location after a comma or tab —
          e.g. <span className="font-mono">Protector, solar plexus</span>.
          Anything unmatched lands in free space below the figure, ready to
          place.
        </p>
        <textarea
          className="mt-3 min-h-0 flex-1 resize-none rounded-xl p-3 text-sm outline-none"
          style={{ background: "rgba(255,255,255,0.8)", border: "1px solid var(--line)" }}
          rows={6}
          autoFocus
          placeholder={"Inner Critic\tforehead\nAnxious One, stomach\nThe Watcher, behind me"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-3 flex shrink-0 justify-end gap-2">
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
