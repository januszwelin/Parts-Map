"use client";

import { useEffect, useState } from "react";

/** Layout-level phone check (mirrors the Tailwind `sm` breakpoint, plus a
 *  landscape-phone case that breakpoint alone can't see) — used only to
 *  choose which chrome to render (floating popover vs bottom sheet).
 *  Gesture code keeps its per-event `isTouchInput` — a mouse on a small
 *  window gets phone LAYOUT but mouse BEHAVIOR.
 *
 *  A phone rotated to landscape is almost always wider than 639px (iPhone
 *  SE ≈667, iPhone 14 ≈844) — width alone silently handed it the desktop
 *  dialect: top toolbar, floating popover editor, docked list panel, on a
 *  device with no mouse and no hover. The second clause catches it without
 *  misclassifying a real tablet: `pointer: coarse` picks out touch-primary
 *  devices, and a short viewport (≤500px tall) is true of every phone in
 *  landscape but no tablet in either orientation (iPad landscape is
 *  ≈768px tall, the shortest common tablet). */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const width = window.matchMedia("(max-width: 639px)");
    const landscapePhone = window.matchMedia(
      "(pointer: coarse) and (max-height: 500px)",
    );
    const update = () => setPhone(width.matches || landscapePhone.matches);
    update();
    width.addEventListener("change", update);
    landscapePhone.addEventListener("change", update);
    return () => {
      width.removeEventListener("change", update);
      landscapePhone.removeEventListener("change", update);
    };
  }, []);
  return phone;
}

/** Reactive prefers-reduced-motion. The drag loop reads the media query
 *  per drag; this hook is for render-time choices (e.g. handing edge
 *  auto-pan back to React Flow when our camera glides are off). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Reactive `(pointer: coarse)` — a touch/stylus primary pointer, no
 *  hover. Used to widen tap targets (arrow hit area, connect dots) that
 *  a mouse cursor doesn't need — a laptop with a touchscreen but a mouse
 *  as its primary pointer correctly reads as fine, not coarse. */
export function useIsCoarse(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}
