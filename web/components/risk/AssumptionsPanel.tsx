import type { RiskMeta } from "@/lib/risk-types";
import { formatPct } from "@/lib/format";

export default function AssumptionsPanel({
  meta,
  benchmarkName,
}: {
  meta: RiskMeta;
  benchmarkName: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Assumptions &amp; Caveats
      </h2>
      <ul className="flex flex-col gap-1.5 text-sm text-zinc-400">
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <span>
            Risk-free rate: {formatPct(meta.risk_free_rate_annual, 2)} annualized.{" "}
            {meta.risk_free_rate_note}
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <span>
            VaR at {formatPct(meta.var_confidence, 0)} confidence: {meta.var_method}
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <span>
            Beta/Alpha use CAPM against the {benchmarkName}: a single-factor
            model that only accounts for market exposure, not other risk
            factors. Beta assumes a linear relationship, and alpha estimates
            get noisy over short windows — both are strongest read over
            multi-year windows.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <span>
            Combined portfolios are equal-weight only, blended from daily
            returns — no custom weighting yet.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <span>
            The Efficient Frontier uses historical mean returns and
            covariance as stand-ins for future behavior — mean-variance
            optimization is highly sensitive to those estimates, especially
            expected returns, and can produce extreme or unstable weights as
            a result. See the caveat on that section for detail.
          </span>
        </li>
      </ul>
    </div>
  );
}
