"use client";

/* ════════════════════════════════════════════════════════════════════
   LOCATION PICKER — the phone sheet's location editor
   ════════════════════════════════════════════════════════════════════

   A native <input list=datalist> reads as a broken, cramped dropdown on
   a small screen (the client's word: "doesn't feel like a well designed
   dropdown"), so the phone sheet gets its own picker instead: a search
   box that doubles as the free-text matcher, plus the region vocabulary
   grouped into a handful of scannable sections. Search filters labels by
   substring AND resolves synonyms/side/back phrasing the same way typed
   location text always has (`matchRegion` — the exact function the
   desktop field and import already use), so "gut" still finds the navel
   and "right shoulder" still finds "Shoulder right" even though neither
   is a literal substring of the other.

   Nothing commits while typing — the search text is a query, not a
   draft edit, so this component deliberately does NOT join the
   part-editor's commit-registry: dismissing the sheet mid-search must
   never snap a part to whatever gibberish was last typed. A location
   only changes when the user taps a row. */

import { useState } from "react";
import { REGION_BY_KEY, REGION_SECTIONS } from "@/lib/regions";
import { matchRegion } from "@/lib/matcher";
import type { Part } from "@/lib/types";
import { useAppApi } from "@/hooks/use-app-api";

export function LocationPicker({
  part,
  onDone,
}: {
  part: Part;
  onDone: () => void;
}) {
  const api = useAppApi();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const sections = q
    ? REGION_SECTIONS.map((g) => ({
        ...g,
        regions: g.regions.filter((r) => r.label.toLowerCase().includes(q)),
      })).filter((g) => g.regions.length > 0)
    : REGION_SECTIONS;

  const resolved = q ? matchRegion(query) : null;
  const resolvedRegion = resolved ? REGION_BY_KEY[resolved.key] : null;
  // Only pin the resolved row when it isn't already sitting in the plain
  // substring results below (typing an exact label would otherwise show
  // the same region twice).
  const alreadyListed =
    !!resolvedRegion &&
    sections.some((g) => g.regions.some((r) => r.key === resolvedRegion.key));
  const noMatches = q.length > 0 && sections.length === 0 && !resolvedRegion;

  const choose = (label: string) => {
    if (api.setLocationText(part.id, label)) onDone();
  };

  return (
    <div className="fade-in flex flex-col">
      <div className="flex items-center gap-2 pb-2.5">
        <button
          aria-label="Back"
          onClick={onDone}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base transition-opacity active:opacity-70"
          style={{ background: "rgba(0,0,0,0.05)", color: "var(--ink-soft)" }}
        >
          ‹
        </button>
        <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--ink)" }}>
          Where does “{part.name}” live?
        </span>
      </div>
      <input
        className="mb-2.5 w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={{
          background: "rgba(255,255,255,0.7)",
          border: "1px solid var(--line)",
          color: "var(--ink)",
        }}
        value={query}
        placeholder="search, or describe it — “behind me”…"
        aria-label="Search locations"
        enterKeyHint="search"
        inputMode="search"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <div
        className="-mx-1 overflow-y-auto overscroll-contain px-1"
        style={{ maxHeight: "40dvh" }}
      >
        {resolvedRegion && !alreadyListed && (
          <button
            className="mb-2 flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm"
            style={{
              background: "color-mix(in srgb, var(--accent) 14%, transparent)",
              color: "var(--ink)",
            }}
            onClick={() => choose(query)}
          >
            <span aria-hidden style={{ color: "var(--accent)" }}>
              →
            </span>
            <span className="truncate">{resolvedRegion.label}</span>
          </button>
        )}
        {noMatches && (
          <p className="px-1 pb-2 text-[11px]" style={{ color: "var(--ink-faint)" }}>
            No match — browse below, or leave it as is.
          </p>
        )}
        {(noMatches ? REGION_SECTIONS : sections).map((g) => (
          <div key={g.name} className="mb-1">
            <div
              className="px-1 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide"
              style={{ color: "var(--ink-faint)" }}
            >
              {g.name}
            </div>
            {g.regions.map((r) => {
              const active = r.key === part.location;
              return (
                <button
                  key={r.key}
                  className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm"
                  style={{
                    background: active
                      ? "rgba(125,139,116,0.14)"
                      : "transparent",
                    color: "var(--ink)",
                  }}
                  onClick={() => choose(r.label)}
                >
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  {r.isBack && (
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
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
