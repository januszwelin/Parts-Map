"use client";

/* ════════════════════════════════════════════════════════════════════
   IMPORT — paste a list of parts, one per line. A centered modal on
   desktop; on phones a keyboard-aware bottom sheet (the shared shell),
   because a centered dialog with the iOS keyboard up is a desktop
   pattern that leaves its buttons stranded at the top of the screen.
   ════════════════════════════════════════════════════════════════════ */

import { useRef, useState } from "react";
import { panelStyle } from "@/lib/ui";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useIsPhone } from "@/hooks/use-media";
import { BottomSheet } from "@/components/bottom-sheet";

const HELPER = (
  <>
    One part per line. Optionally add a location after a comma or tab — e.g.{" "}
    <span className="font-mono">Protector, solar plexus</span>. Anything
    unmatched lands in free space below the figure, ready to place.
  </>
);
const PLACEHOLDER =
  "Inner Critic\tforehead\nAnxious One, stomach\nThe Watcher, behind me";

export function ImportModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (text: string) => void;
}) {
  const isPhone = useIsPhone();
  const [text, setText] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open && !isPhone, panelRef);
  const submit = () => {
    onImport(text);
    setText("");
    onClose();
  };

  if (isPhone) {
    // No autofocus here: the sheet is always mounted (for the slide), and
    // summoning the keyboard the instant the sheet arrives would yank the
    // layout — tapping the paste area is the natural first move.
    return (
      <BottomSheet
        open={open}
        onClose={onClose}
        maxHeight="85dvh"
        label="Import parts"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between pb-1.5">
            <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Import parts
            </span>
            <button
              aria-label="Cancel import"
              className="shrink-0 rounded-full px-3 py-2 text-xs pointer-coarse:min-h-10"
              style={{ background: "rgba(0,0,0,0.05)", color: "var(--ink-soft)" }}
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
          <p
            className="shrink-0 text-[12px] leading-relaxed"
            style={{ color: "var(--ink-soft)" }}
          >
            {HELPER}
          </p>
          <textarea
            className="mt-2.5 min-h-0 flex-1 resize-none rounded-xl p-3 text-sm outline-none"
            style={{
              background: "rgba(255,255,255,0.8)",
              border: "1px solid var(--line)",
            }}
            rows={8}
            placeholder={PLACEHOLDER}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="mt-3 min-h-11 w-full shrink-0 rounded-xl text-sm text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)" }}
            onClick={submit}
          >
            Import
          </button>
        </div>
      </BottomSheet>
    );
  }

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
          {HELPER}
        </p>
        <textarea
          className="mt-3 min-h-0 flex-1 resize-none rounded-xl p-3 text-sm outline-none"
          style={{ background: "rgba(255,255,255,0.8)", border: "1px solid var(--line)" }}
          rows={6}
          autoFocus
          placeholder={PLACEHOLDER}
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
            onClick={submit}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
