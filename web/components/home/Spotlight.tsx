"use client";

import { useEffect, useRef } from "react";

// Page-level cursor glow: one large, low-opacity emerald radial gradient
// that follows the pointer across the dark background.
//
// Performance contract (the reason this is a component and not a hook in
// the page): the cursor position lives ONLY in CSS custom properties
// written straight to the DOM node via a ref, throttled to one write per
// animation frame. It is never React state, so pointer movement triggers
// zero re-renders of this component or anything around it.
//
// The overlay is inert (pointer-events-none, aria-hidden) and is switched
// off entirely by the --spotlight-opacity media queries in globals.css
// under prefers-reduced-motion, touch, and any non-hover pointer.
export default function Spotlight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect the same conditions the CSS does, so we don't even attach a
    // listener on devices where the effect is disabled.
    const disabled = window.matchMedia(
      "(prefers-reduced-motion: reduce), (hover: none), (pointer: coarse)",
    );
    if (disabled.matches) return;

    let frame = 0;
    let pendingX = 0;
    let pendingY = 0;

    function apply() {
      frame = 0;
      el!.style.setProperty("--spotlight-x", `${pendingX}px`);
      el!.style.setProperty("--spotlight-y", `${pendingY}px`);
      // Reveal only once a real cursor position is known, so the effect
      // never shows up parked at its CSS default before the first move.
      el!.style.setProperty("--spotlight-ready", "1");
    }

    function handleMove(e: PointerEvent) {
      // Viewport coordinates: the overlay is fixed-position, so no need to
      // measure the element or account for scrolling.
      pendingX = e.clientX;
      pendingY = e.clientY;
      if (!frame) frame = requestAnimationFrame(apply);
    }

    window.addEventListener("pointermove", handleMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handleMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={ref} aria-hidden className="spotlight-glow pointer-events-none fixed inset-0 z-0" />;
}
