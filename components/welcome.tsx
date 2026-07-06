"use client";

/* ════════════════════════════════════════════════════════════════════
   WELCOME — the first-run modal (and the "?" button's way back to it)
   ════════════════════════════════════════════════════════════════════

   Minimal on purpose: two sentences on what the app is, and a choice
   between diving in and taking the guided tour (components/coach-marks).
   No scrim-tap dismiss — this is a one-time decision, not a panel you
   flick open and closed, so the two buttons are the only way out. */

import { panelStyle } from "@/lib/ui";

export function WelcomeModal({
  open,
  onClose,
  onStartTour,
  onExplore,
}: {
  open: boolean;
  onClose: () => void;
  onStartTour: () => void;
  /** Load a small pre-built example system so a newcomer has something to
   *  react to instead of a bare outline. */
  onExplore: () => void;
}) {
  if (!open) return null;
  return (
    <div
      data-ui-chrome
      className="fade-in absolute inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(58,55,51,0.22)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-5 text-center"
        style={{ ...panelStyle, background: "#FDFCFA" }}
      >
        <h2 className="text-base font-medium" style={{ color: "var(--ink)" }}>
          Welcome to Parts Map
        </h2>
        <p
          className="mt-2 text-[13px] leading-relaxed"
          style={{ color: "var(--ink-soft)" }}
        >
          A quiet, spatial place for IFS parts work — name a part, place it
          on the body, and draw the relationships between your parts.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            className="rounded-xl px-4 py-2.5 text-sm text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)" }}
            onClick={onStartTour}
          >
            Show me around
          </button>
          <button
            className="rounded-xl px-4 py-2.5 text-sm hover:bg-black/5"
            style={{ color: "var(--ink-soft)" }}
            onClick={onExplore}
          >
            Explore an example
          </button>
          <button
            className="rounded-xl px-4 py-2.5 text-sm hover:bg-black/5"
            style={{ color: "var(--ink-soft)" }}
            onClick={onClose}
          >
            Start blank
          </button>
        </div>
        <p
          className="mt-4 text-[11px] leading-relaxed"
          style={{ color: "var(--ink-faint)" }}
        >
          Your map stays on this device unless you save it.
        </p>
      </div>
    </div>
  );
}
