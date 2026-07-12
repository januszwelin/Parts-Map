"use client";

/* ════════════════════════════════════════════════════════════════════
   DEVICE PREFERENCES — small UI choices remembered per device
   ════════════════════════════════════════════════════════════════════

   Same localStorage discipline as lib/draft.ts: SSR-guarded, try/caught
   for privacy-mode browsers, and holding NO map content — these are
   pure chrome preferences (how the wheel behaves, whether the minimap
   shows). Map data stays in the MapDoc; consented drafts in lib/draft. */

const SCROLL_PAN_KEY = "pm.scrollPan";
const MINIMAP_KEY = "pm.minimap";

function getFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function setFlag(key: string, on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    /* private mode or storage disabled — the pref just won't stick */
  }
}

/** Wheel pans the canvas (Ctrl/Cmd+scroll zooms) instead of zooming. */
export const getScrollPan = () => getFlag(SCROLL_PAN_KEY);
export const setScrollPan = (on: boolean) => setFlag(SCROLL_PAN_KEY, on);

/** Show the minimap (desktop, above the zoom pill). */
export const getMinimap = () => getFlag(MINIMAP_KEY);
export const setMinimap = (on: boolean) => setFlag(MINIMAP_KEY, on);
