"use client";

/* ════════════════════════════════════════════════════════════════════
   LOCAL DRAFT — opt-in, so a tab-close never silently loses work
   ════════════════════════════════════════════════════════════════════

   The app is deliberately storage-free by default (maps are sensitive
   psychological data — see CLAUDE.md). This is the one exception, and it is
   OFF unless the person explicitly turns it on: when enabled, the current
   map is mirrored to this device's localStorage so it can be offered back
   after an accidental reload. Two keys only — a boolean consent flag and the
   draft doc itself — and every access is guarded for SSR and for privacy-mode
   browsers that throw on storage. Turning the toggle off wipes the draft. */

import type { MapDoc } from "@/lib/types";

const ENABLED_KEY = "pm.draftEnabled";
const DRAFT_KEY = "pm.draft";

export function getDraftEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDraftEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) {
      window.localStorage.setItem(ENABLED_KEY, "1");
    } else {
      window.localStorage.removeItem(ENABLED_KEY);
      window.localStorage.removeItem(DRAFT_KEY);
    }
  } catch {
    /* private mode or storage disabled — the toggle just won't stick */
  }
}

export function saveDraft(doc: MapDoc): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(doc));
  } catch {
    /* storage full or disabled — drop it silently */
  }
}

/** The raw stored JSON, or null. Callers run it through `parseMapJson` so a
 *  tampered/stale draft is validated exactly like a file import. */
export function readDraftJson(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to clean up */
  }
}
