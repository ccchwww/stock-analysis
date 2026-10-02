import { ImageResponse } from "next/og";
import { getMarketData } from "@/lib/market-data-results";
import { getStressData } from "@/lib/stress-data-results";
import { getValidationData } from "@/lib/validation-results";
import { computeHeroStats } from "@/lib/home-hero";
import { SITE } from "@/lib/site";

// The link-preview card, generated at build time by next/og (no extra
// dependency -- ImageResponse ships with Next).
//
// Declared on the ROOT segment, so every route inherits it: /strategies,
// /risk-dashboard, /validation and /assumptions all get a valid card
// without a file each. Their titles still differ, because the per-tab
// `title` flows through the template in layout.tsx.
//
// The stat line is READ FROM THE DATA, via the same computeHeroStats() the
// home page's hero strip uses -- so the card a recruiter sees in Slack
// carries the same numbers as the page it links to, and both move when the
// nightly refresh moves them.

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Site palette (app/globals.css). Written out because Satori resolves no
// CSS variables and no Tailwind classes -- it only sees inline styles.
const BACKGROUND = "#0a0e14";
const FOREGROUND = "#e4e7eb";
const MUTED = "#71717a";
const BORDER = "#232b38";
const ACCENT = "#34d399";

export default async function OpengraphImage() {
  const [marketData, stressData, validationData] = await Promise.all([
    getMarketData(),
    getStressData(),
    getValidationData(),
  ]);

  // Evaluable observations in the VaR backtest: every trading day except the
  // warm-up that only seeds the first rolling window. Same definition
  // web/lib/var-backtest.ts uses, without re-running the backtest just to
  // count its rows.
  const varBacktestDays = Math.max(
    0,
    marketData.meta.dates.length - validationData.meta.var_window_days,
  );

  // First three only: four stat pairs overflow 1200px at a legible size, and
  // a card that runs off its own edge is worse than one that says less.
  const stats = computeHeroStats({
    marketData,
    stressData,
    validationData,
    varBacktestDays,
  }).slice(0, 3);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: BACKGROUND,
          color: FOREGROUND,
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", fontSize: 86, fontWeight: 700, letterSpacing: -2 }}>
          <span>QUANT</span>
          <span style={{ color: ACCENT }}>/</span>
          <span>RISK</span>
        </div>

        <div style={{ display: "flex", fontSize: 34, color: FOREGROUND, marginTop: 28, lineHeight: 1.3, maxWidth: 940 }}>
          {SITE.tagline}
        </div>

        <div style={{ display: "flex", fontSize: 25, color: MUTED, marginTop: 20, maxWidth: 960, lineHeight: 1.4 }}>
          Out-of-sample VaR backtesting, Kupiec/Christoffersen tests, and four real
          crises replayed — including the results that fail.
        </div>

        <div style={{ display: "flex", width: 132, height: 4, background: ACCENT, marginTop: 44, borderRadius: 2 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 40, fontSize: 24, color: MUTED }}>
          {stats.map((stat, i) => (
            <div key={stat.label} style={{ display: "flex", alignItems: "center", gap: 22 }}>
              {i > 0 && <div style={{ display: "flex", width: 1, height: 24, background: BORDER }} />}
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ color: FOREGROUND, fontWeight: 600 }}>{stat.value}</span>
                <span>{stat.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
