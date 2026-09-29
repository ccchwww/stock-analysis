import Link from "next/link";
import { getMarketData } from "@/lib/market-data-results";
import { getStressData } from "@/lib/stress-data-results";
import { getValidationData } from "@/lib/validation-results";
import { getRiskData } from "@/lib/risk-results";
import { getResults } from "@/lib/results";
import { computeHomeFindings, type Finding } from "@/lib/home-findings";
import { computeHeroArt, computeHeroStats } from "@/lib/home-hero";
import { AUTHOR, MODEL_DOC_URL, SITE, isPlaceholder } from "@/lib/site";
import DataFreshnessBadge from "@/components/nav/DataFreshnessBadge";
import Spotlight from "@/components/home/Spotlight";
import SpotlightCard from "@/components/home/SpotlightCard";
import HeroCurve from "@/components/home/HeroCurve";

// Server Component. It reads the same JSON the dashboards read, computes
// the four headline findings at BUILD TIME via the existing lib functions,
// and passes ONLY those small result objects down. market_data.json /
// stress_data.json never reach the browser from this route -- the
// Validation page already ships ~2.9 MB of HTML and this page must stay
// light, since it's the 30-second first impression.

const TONE_ACCENT: Record<Finding["tone"], string> = {
  positive: "text-emerald-400",
  negative: "text-amber-400",
  neutral: "text-zinc-300",
};

// Hero buttons: both variants fill solid emerald on hover, with
// near-black text (the page background color) for contrast -- emerald-400
// on #0a0e14 is a very high contrast pair, so the label stays legible once
// the fill lands. They differ only at rest: the first action is tinted,
// the other two are outlined.
const BUTTON_BASE =
  "rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150 hover:bg-emerald-400 hover:text-[#0a0e14]";
const BUTTON_PRIMARY = `${BUTTON_BASE} bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/40 hover:ring-emerald-400`;
const BUTTON_SECONDARY = `${BUTTON_BASE} border border-border text-zinc-300 hover:border-emerald-400`;

const DIFFERENTIATORS = [
  {
    title: "Out-of-sample everywhere",
    body: "Each day's VaR forecast is built only from the 250 days before it, never including the day it predicts. Stress-test portfolio weights are estimated from the 3 years before each crisis opens, then held fixed through it. Every strategy's monthly basket is chosen on the previous month's final close, asserted on each rebalance rather than trusted. Where a look-ahead rule is load-bearing, the code says so at the point it's enforced.",
  },
  {
    title: "The models are statistically tested",
    body: "Kupiec for breach coverage, Christoffersen for independence, conditional coverage for both at once, and the Basel traffic light on actual 250-observation windows. Computing a risk number is easy; showing whether it was right is the point.",
  },
  {
    title: "Failures are reported, not hidden",
    body: "Strategies that lose to Buy & Hold are shown losing. Survivorship bias is flagged next to the result it inflates, not buried in a footer. Every tab states its own assumptions and limitations on the page.",
  },
];

// Built from the loaded JSON rather than written out, so the counts here can
// never disagree with what the tabs actually show after a data refresh adds,
// removes, or renames a strategy, benchmark, or crisis window.
function buildTabs({
  numStrategies,
  benchmarkLabels,
  numCrises,
}: {
  numStrategies: number;
  benchmarkLabels: string[];
  numCrises: number;
}) {
  const benchmarkText =
    benchmarkLabels.length > 0 ? benchmarkLabels.join(" and ") : "passive index";
  return [
    {
      href: "/strategies",
      title: "Strategies",
      body: `${numStrategies} trading strategies backtested against both an equal-weight Buy & Hold of the same names and passive ${benchmarkText} ETF benchmarks in CAD — net of transaction costs, with a cost-sensitivity panel showing the break-even cost at which each edge disappears, and the survivorship caveat attached to the winning result.`,
    },
    {
      href: "/risk-dashboard",
      title: "Risk Dashboard",
      body: "Volatility, Sharpe, drawdown, VaR, expected shortfall, correlation, CAPM beta/alpha, rolling metrics, Monte Carlo, and a long-only efficient frontier.",
    },
    {
      href: "/validation",
      title: "Model Validation",
      body: `Does any of the above actually work? VaR backtesting with three likelihood-ratio tests, the Basel traffic light, and ${numCrises} real crises replayed against the current selection.`,
    },
  ];
}

export default async function Home() {
  const [marketData, stressData, validationData, riskData, results] = await Promise.all([
    getMarketData(),
    getStressData(),
    getValidationData(),
    getRiskData(),
    getResults(),
  ]);

  const { findings, presetLabel, dataAsOf, startDate, varBacktestDays } = computeHomeFindings({
    marketData,
    stressData,
    validationData,
    riskMeta: riskData.meta,
  });

  const tabs = buildTabs({
    numStrategies: results.meta.strategy_order.length,
    benchmarkLabels: Object.values(marketData.index_benchmarks).map((b) => b.label),
    numCrises: validationData.stress.windows.length,
  });

  const heroArt = computeHeroArt(results);
  const heroStats = computeHeroStats({ marketData, stressData, validationData, varBacktestDays });

  return (
    <>
      <Spotlight />

      <div className="relative z-[1] flex flex-col gap-16 py-4">
        {/* 1 — Hero. The curve backdrop is absolutely positioned and inert;
            the content sits above it in a relative wrapper so nothing about
            the text's own layout changes. */}
        <section className="relative -mx-4 overflow-hidden px-4 pt-8 sm:-mx-6 sm:px-6 sm:pt-12">
          {heroArt && <HeroCurve art={heroArt} />}

          <div className="relative flex flex-col items-start gap-5">
          <h1 className="font-mono text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            QUANT<span className="text-emerald-400">/</span>RISK
          </h1>
          <p className="max-w-2xl text-lg text-zinc-300">{SITE.tagline}</p>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
            Most portfolio projects compute metrics and stop there. This one also tests whether its own
            models are right — backtesting the VaR it reports, running standard statistical tests against it,
            and replaying real crises out-of-sample. Every feature states its assumptions and limitations on
            the page it appears on, including the ones that count against it.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link href="/strategies" className={BUTTON_PRIMARY}>
              Strategies
            </Link>
            <Link href="/risk-dashboard" className={BUTTON_SECONDARY}>
              Risk Dashboard
            </Link>
            <Link href="/validation" className={BUTTON_SECONDARY}>
              Model Validation
            </Link>
          </div>

          {/* Freshness stamp. The date is market_data.json's own last covered
              trading day, and the badge beside it is a client component that
              compares it to the VIEWER's clock -- this page is statically
              prerendered and only rebuilds when a refresh succeeds, so a
              build-time staleness check could never fire on the one day it
              matters. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-zinc-400">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span>
              Market data through{" "}
              <span className="font-mono text-zinc-200">{dataAsOf}</span>
            </span>
            <span aria-hidden className="text-zinc-600">
              ·
            </span>
            <span>refreshed automatically each weeknight after the TSX close</span>
            <DataFreshnessBadge asOf={dataAsOf} />
          </div>

          {/* Stats strip. Values come from the same loaders the rest of
              the page uses -- none are written by hand. */}
          <dl className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-5">
            {heroStats.map((stat, i) => (
              <div
                key={stat.label}
                className={i > 0 ? "border-border sm:border-l sm:pl-6" : undefined}
              >
                <dd className="font-mono text-xl font-semibold tabular-nums text-zinc-200">
                  {stat.value}
                </dd>
                <dt className="mt-0.5 text-xs uppercase tracking-wide text-zinc-500">{stat.label}</dt>
              </div>
            ))}
          </dl>
          </div>
        </section>

        {/* 2 — What makes it different */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            What makes it different
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {DIFFERENTIATORS.map((d) => (
              <SpotlightCard key={d.title} className="p-4">
                <h3 className="text-sm font-semibold text-foreground">{d.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{d.body}</p>
              </SpotlightCard>
            ))}
          </div>
        </section>

        {/* 3 — Headline findings, computed at build time */}
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Headline findings</h2>
            <p className="font-mono text-xs text-zinc-500">
              {presetLabel} · data as of {dataAsOf}
            </p>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-500">
            Computed from the same data and the same code as the Model Validation tab — not written by hand.
            Select the &ldquo;{presetLabel}&rdquo; preset there, with the default start date of {startDate}, to
            reproduce these exact numbers.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {findings.map((f) => (
              <SpotlightCard key={f.key} href={f.href} className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{f.eyebrow}</p>
                <p className={`mt-2 font-mono text-xl font-semibold ${TONE_ACCENT[f.tone]}`}>{f.value}</p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-200">{f.headline}</p>
                <p className="mt-2 border-t border-border pt-2 text-xs leading-relaxed text-zinc-500">
                  {f.detail}
                </p>
              </SpotlightCard>
            ))}
          </div>
        </section>

        {/* 4 — Tabs */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Explore</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {tabs.map((t) => (
              <SpotlightCard key={t.href} href={t.href} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
                  <span aria-hidden className="text-zinc-600 transition-colors group-hover:text-emerald-400">
                    →
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t.body}</p>
              </SpotlightCard>
            ))}
          </div>
        </section>

        {/* 5 — Honesty strip */}
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            What this model cannot do
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-zinc-400">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span>
                <span className="text-zinc-200">No look-ahead bias.</span>{" "}
                Every forecast and every portfolio weight is estimated strictly from data available before the
                period it is applied to.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span>
                <span className="text-zinc-200">Survivorship bias is present and acknowledged.</span>{" "}
                The universe is today&rsquo;s S&amp;P/TSX 60 applied backwards, so names dropped from the index
                are missing. This inflates strategies that rank and buy past winners more than it inflates Buy
                &amp; Hold. Quantifying it would require point-in-time constituent data, which this project
                does not have.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span>
                Full detail:{" "}
                <Link href="/assumptions" className="text-emerald-400 underline decoration-emerald-500/40 hover:text-emerald-300">
                  Assumptions &amp; Limitations
                </Link>{" "}
                on this site, and the{" "}
                <a
                  href={MODEL_DOC_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 underline decoration-emerald-500/40 hover:text-emerald-300"
                >
                  full model documentation
                </a>{" "}
                on GitHub, which includes the known-deficiencies table and the change log.
              </span>
            </li>
          </ul>
        </section>

        {/* 6 — Built by. Each link falls back to plain text while its
            constant in lib/site.ts is still a TODO, so no placeholder ever
            ships as a broken href. */}
        <section className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>Built by {AUTHOR.name}</span>
          <span aria-hidden>·</span>
          {isPlaceholder(AUTHOR.github) ? (
            <span>GitHub</span>
          ) : (
            <a
              href={AUTHOR.github}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-zinc-700 hover:text-zinc-300"
            >
              GitHub
            </a>
          )}
          <span aria-hidden>·</span>
          {isPlaceholder(AUTHOR.linkedin) ? (
            <span>LinkedIn</span>
          ) : (
            <a
              href={AUTHOR.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-zinc-700 hover:text-zinc-300"
            >
              LinkedIn
            </a>
          )}
        </section>
      </div>
    </>
  );
}
