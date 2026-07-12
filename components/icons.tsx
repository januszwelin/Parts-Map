"use client";

/* Shared 16px quiet line icons — the toolbar's IconSvg convention
   (16×16 viewBox, 1.5 stroke, round caps, currentColor) extracted so
   other chrome (the parts list) can speak the same icon language
   without importing the toolbar. */

import React from "react";

export function IconSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block" }}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function EllipsisIcon() {
  return (
    <IconSvg>
      <circle cx="3.5" cy="8" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="8" r="1.15" fill="currentColor" stroke="none" />
    </IconSvg>
  );
}

export function CloseIcon() {
  return (
    <IconSvg>
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </IconSvg>
  );
}

export function SearchIcon() {
  return (
    <IconSvg>
      <circle cx="7.2" cy="7.2" r="3.9" />
      <path d="M13.3 13.3 10 10" />
    </IconSvg>
  );
}
