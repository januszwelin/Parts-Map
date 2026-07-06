/* ════════════════════════════════════════════════════════════════════
   ONBOARDING — the one flag the app is allowed to remember
   ════════════════════════════════════════════════════════════════════

   Everything else about a map is deliberately storage-free (CLAUDE.md:
   "no autosave, no storage — the maps are sensitive"). Whether someone
   has already seen the welcome screen isn't sensitive and isn't map
   data, so it gets a single, narrowly-scoped localStorage boolean — the
   only localStorage read/write anywhere in this app. Guarded for SSR and
   for privacy-mode browsers that throw on storage access. */

const KEY = "pm.welcomeSeen";

export function getWelcomeSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setWelcomeSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* private mode or storage disabled — the welcome just reappears */
  }
}
