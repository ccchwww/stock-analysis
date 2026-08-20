import type { SeriesTestResult } from "@/lib/var-backtest";
import { formatPct } from "@/lib/format";

function verdictClass(reject: boolean): string {
  return reject ? "text-red-400" : "text-emerald-400";
}

export default function VarComparisonTable({ results }: { results: SeriesTestResult[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">Historical vs Parametric, Both Confidence Levels</h2>
      <p className="mb-4 text-xs leading-relaxed text-zinc-500">
        ✓ = test passes (no evidence against the model at 5% significance) · ✕ = test rejects. Expect
        parametric VaR to be breached more than its nominal rate at 99% if returns have fat tails (see
        Excess Kurtosis above) — that pattern here is the empirical case for volatility models like GARCH,
        not a bug.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2 font-medium">Method</th>
              <th className="px-3 py-2 font-medium text-right">Conf.</th>
              <th className="px-3 py-2 font-medium text-right">N</th>
              <th className="px-3 py-2 font-medium text-right">Exceptions</th>
              <th className="px-3 py-2 font-medium text-right">Expected</th>
              <th className="px-3 py-2 font-medium text-right">Rate</th>
              <th className="px-3 py-2 font-medium text-right">Kupiec</th>
              <th className="px-3 py-2 font-medium text-right">Christoffersen</th>
              <th className="px-3 py-2 font-medium text-right">Cond. Coverage</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={`${r.method}-${r.confidence}`} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2 capitalize text-foreground">{r.method}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">
                  {formatPct(r.confidence, 0)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">{r.n}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">{r.exceptions}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-500">
                  {r.expectedExceptions.toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">
                  {formatPct(r.exceptionRate, 2)}
                </td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums ${verdictClass(r.kupiec.reject)}`}>
                  {r.kupiec.pValue.toFixed(3)} {r.kupiec.reject ? "✕" : "✓"}
                </td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums ${verdictClass(r.christoffersen.reject)}`}>
                  {r.christoffersen.pValue.toFixed(3)} {r.christoffersen.reject ? "✕" : "✓"}
                </td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums ${verdictClass(r.conditionalCoverage.reject)}`}>
                  {r.conditionalCoverage.pValue.toFixed(3)} {r.conditionalCoverage.reject ? "✕" : "✓"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
