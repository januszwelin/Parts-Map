"use client";

/* ════════════════════════════════════════════════════════════════════
   PHONE TOP BAR — the Miro-style identity/nav strip: a home button
   (→ My Maps), the current map's name (tap → rename), and search /
   share / more actions that open the phone sheets. Phone layout only
   (`sm:hidden`); desktop keeps the classic top Toolbar.
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

function HomeIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" {...stroke} aria-hidden style={{ display: "block" }}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" {...stroke} aria-hidden style={{ display: "block" }}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" {...stroke} aria-hidden style={{ display: "block" }}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.6 15.4 6.4" />
      <path d="M8.6 13.4 15.4 17.6" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ display: "block" }}>
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

export function PhoneTopBar({
  mapTitle,
  onHome,
  onTitle,
  onSearch,
  onShare,
  onMore,
}: {
  mapTitle: string;
  onHome: () => void;
  onTitle: () => void;
  onSearch: () => void;
  onShare: () => void;
  onMore: () => void;
}) {
  const iconBtn =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-black/5 active:bg-black/10 pointer-coarse:min-h-11 pointer-coarse:min-w-11";
  // Landscape phones are ≥640px wide — the `sm:hidden` CSS gate alone
  // would swap this bar for the desktop toolbar there, while the sheets
  // (JS-gated on useIsPhone) stay phone-flavored. Keep the CSS default
  // for a hydration-safe first paint, drop it once isPhone is known.
  const isPhone = useIsPhone();
  return (
    <div
      data-ui-chrome
      className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] ${isPhone ? "" : "sm:hidden"}`}
    >
      <div
        className="pointer-events-auto flex w-full select-none items-center gap-1 rounded-2xl px-1.5 py-1.5"
        style={{ ...panelStyle, touchAction: "manipulation" }}
      >
        <button
          aria-label="Home — my maps"
          className={iconBtn}
          style={{ color: "var(--ink-soft)" }}
          onClick={onHome}
        >
          <HomeIcon />
        </button>
        <button
          aria-label={`Map: ${mapTitle} — rename`}
          title={mapTitle}
          className="min-w-0 flex-1 truncate rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-black/5 active:bg-black/10"
          style={{ color: "var(--ink)" }}
          onClick={onTitle}
        >
          {mapTitle}
        </button>
        <button
          aria-label="Search parts"
          className={iconBtn}
          style={{ color: "var(--ink-soft)" }}
          onClick={onSearch}
        >
          <SearchIcon />
        </button>
        <button
          aria-label="Share & export"
          className={iconBtn}
          style={{ color: "var(--ink-soft)" }}
          onClick={onShare}
        >
          <ShareIcon />
        </button>
        <button
          aria-label="More options"
          className={iconBtn}
          style={{ color: "var(--ink-soft)" }}
          onClick={onMore}
        >
          <MoreIcon />
        </button>
      </div>
    </div>
  );
}
