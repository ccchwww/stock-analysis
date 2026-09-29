import type { HeroArt } from "@/lib/home-hero";

// Server component: pure markup, no client JS. The path strings arrive
// already computed (lib/home-hero.ts), so the browser gets a few hundred
// bytes of geometry rather than the underlying returns series.
//
// The draw-in animation is CSS-only (stroke-dashoffset on a pathLength="1"
// path) and is switched off wholesale under prefers-reduced-motion in
// globals.css -- no JS involved either way.
//
// Decorative and inert: aria-hidden, pointer-events-none, and hidden below
// the sm breakpoint where there is no room for it beside the text.
export default function HeroCurve({ art }: { art: HeroArt }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 right-0 hidden w-[62%] items-center sm:flex"
    >
      {/* Uniform scaling (the default preserveAspectRatio) rather than
          "none": a non-uniform stretch would squash the exception dots into
          ellipses, since a circle's radius can't scale per-axis. */}
      <svg viewBox={art.viewBox} className="h-[72%] w-full" role="presentation" focusable="false">
        <defs>
          <linearGradient id="hero-curve-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
          {/* Fades the whole drawing out toward the left so it never
              competes with the hero copy sitting over it.
              Stops MUST be white: an SVG <mask> defaults to
              mask-type: luminance, and black has luminance 0, so black
              stops would mask the entire group away regardless of their
              stop-opacity. */}
          <linearGradient id="hero-curve-mask" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="45%" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fff" stopOpacity="1" />
          </linearGradient>
          <mask id="hero-curve-edge">
            <rect x="0" y="0" width="100%" height="100%" fill="url(#hero-curve-mask)" />
          </mask>
        </defs>

        <g mask="url(#hero-curve-edge)">
          <path className="hero-curve-fade" d={art.areaPath} fill="url(#hero-curve-fill)" />
          <path
            className="hero-curve-line"
            d={art.linePath}
            pathLength="1"
            fill="none"
            stroke="#34d399"
            strokeOpacity="0.45"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {art.dots.map((dot, i) => (
            <circle
              key={i}
              className="hero-curve-fade"
              cx={dot.x}
              cy={dot.y}
              r="2.5"
              fill="#f87171"
              fillOpacity="0.55"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
