"use client";

/* ════════════════════════════════════════════════════════════════════
   PHONE QUICK-TOOLS — the sparse bottom pill: undo · redo │ list · +.
   The everyday touch actions kept one tap away; everything else lives in
   the sheets reached from the top bar. Phone only (`sm:hidden` +
   useIsPhone override for ≥640px landscape phones).
   ════════════════════════════════════════════════════════════════════ */

import { panelStyle } from "@/lib/ui";
import { useIsPhone } from "@/hooks/use-media";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function UndoIcon({ mirrored }: { mirrored?: boolean }) {
  return (
    <svg
      width={17}
      height={17}
      viewBox="0 0 24 24"
      {...stroke}
      aria-hidden
      style={{ display: "block", transform: mirrored ? "scaleX(-1)" : undefined }}
    >
      <path d="M7 8 3 12l4 4" />
      <path d="M3 12h11a6 6 0 0 1 0 12h-2" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" {...stroke} aria-hidden style={{ display: "block" }}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" {...stroke} aria-hidden style={{ display: "block" }}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function PhoneQuickTools({
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
  listOpen,
  onToggleList,
  onAdd,
}: {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  onUndo: () => void;
  onRedo: () => void;
  listOpen: boolean;
  onToggleList: () => void;
  onAdd: () => void;
}) {
  const iconBtn =
    "flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/5 active:bg-black/10 disabled:opacity-30";
  // Same landscape-phone JS override as the top bar — `sm:hidden` alone
  // would hand ≥640px landscape phones the desktop toolbar.
  const isPhone = useIsPhone();
  return (
    <div
      data-ui-chrome
      className={`absolute bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-1/2 z-20 flex -translate-x-1/2 select-none items-center gap-1 rounded-full p-1.5 ${isPhone ? "" : "sm:hidden"}`}
      style={{ ...panelStyle, touchAction: "manipulation" }}
    >
      <button
        aria-label={undoLabel ? `Undo — ${undoLabel}` : "Undo"}
        title={undoLabel ? `Undo — ${undoLabel}` : "Undo"}
        disabled={!canUndo}
        className={iconBtn}
        style={{ color: "var(--ink-soft)" }}
        onClick={onUndo}
      >
        <UndoIcon />
      </button>
      <button
        aria-label={redoLabel ? `Redo — ${redoLabel}` : "Redo"}
        title={redoLabel ? `Redo — ${redoLabel}` : "Redo"}
        disabled={!canRedo}
        className={iconBtn}
        style={{ color: "var(--ink-soft)" }}
        onClick={onRedo}
      >
        <UndoIcon mirrored />
      </button>
      <div className="mx-0.5 h-5 w-px" style={{ background: "var(--line)" }} />
      <button
        data-tour="list"
        aria-label="Parts list"
        aria-pressed={listOpen}
        className={iconBtn}
        style={
          listOpen
            ? { color: "#fff", background: "var(--accent)" }
            : { color: "var(--ink-soft)" }
        }
        onClick={onToggleList}
      >
        <ListIcon />
      </button>
      <button
        data-tour="add"
        aria-label="Add a part"
        className="ml-0.5 flex h-11 w-11 items-center justify-center rounded-full text-white transition-opacity hover:opacity-90 active:opacity-75"
        style={{ background: "var(--accent)" }}
        onClick={onAdd}
      >
        <PlusIcon />
      </button>
    </div>
  );
}
