"use client";

import { useEffect, useState } from "react";

/** Layout-level phone check (mirrors the Tailwind `sm` breakpoint) — used
 *  only to choose which chrome to render (floating popover vs bottom
 *  sheet). Gesture code keeps its per-event `isTouchInput` — a mouse on
 *  a small window gets phone LAYOUT but mouse BEHAVIOR. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
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
