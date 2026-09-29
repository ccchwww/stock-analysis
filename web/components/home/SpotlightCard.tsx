"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

// Card-level spotlight: the border and background light up around the
// cursor as it crosses the card (the Vercel/Linear-style effect), kept
// deliberately subtle for a risk dashboard.
//
// Same performance contract as Spotlight.tsx: --spotlight-x/y and the
// --spotlight-active on/off flag are written directly to the node via a
// ref inside a requestAnimationFrame-throttled handler. No React state, so
// no re-render per pointer move. Listeners are attached to the card itself
// (not the window), so only the hovered card does any work.
//
// Renders as a <Link> when `href` is given, a plain <div> otherwise, so
// the whole card is one click target without nesting interactive elements.
export default function SpotlightCard({
  href,
  className = "",
  children,
}: {
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

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
    }

    function handleMove(e: PointerEvent) {
      // Card-relative coordinates: the gradients are painted inside the
      // card's own box, so the cursor must be measured against it.
      const rect = el!.getBoundingClientRect();
      pendingX = e.clientX - rect.left;
      pendingY = e.clientY - rect.top;
      if (!frame) frame = requestAnimationFrame(apply);
    }

    function handleEnter() {
      el!.style.setProperty("--spotlight-active", "1");
    }
    function handleLeave() {
      el!.style.setProperty("--spotlight-active", "0");
    }

    el.addEventListener("pointermove", handleMove, { passive: true });
    el.addEventListener("pointerenter", handleEnter);
    el.addEventListener("pointerleave", handleLeave);
    return () => {
      el.removeEventListener("pointermove", handleMove);
      el.removeEventListener("pointerenter", handleEnter);
      el.removeEventListener("pointerleave", handleLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // The two overlays are inert and purely decorative; the card's real
  // border stays underneath so the card is fully legible with the effect
  // disabled or unsupported.
  const inner = (
    <>
      <span aria-hidden className="spotlight-card-border pointer-events-none absolute inset-0 rounded-lg" />
      <span aria-hidden className="spotlight-card-fill pointer-events-none absolute inset-0 rounded-lg" />
      <div className="relative">{children}</div>
    </>
  );

  const classes = `group relative overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-zinc-700 ${className}`;

  if (href) {
    return (
      <Link ref={ref as React.Ref<HTMLAnchorElement>} href={href} className={`block ${classes}`}>
        {inner}
      </Link>
    );
  }
  return (
    <div ref={ref as React.Ref<HTMLDivElement>} className={classes}>
      {inner}
    </div>
  );
}
