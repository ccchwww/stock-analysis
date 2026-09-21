import { isSelectionStrategy, type Verdict } from "@/lib/verdict";

const TONE_STYLES: Record<Verdict["tone"], { border: string; dot: string }> = {
  positive: { border: "border-emerald-500/40 bg-emerald-500/5", dot: "bg-emerald-400" },
  negative: { border: "border-red-500/40 bg-red-500/5", dot: "bg-red-400" },
  neutral: { border: "border-amber-500/40 bg-amber-500/5", dot: "bg-amber-400" },
};

export default function VerdictBanner({ verdict }: { verdict: Verdict }) {
  const styles = TONE_STYLES[verdict.tone];

  // Winning rank-and-select strategies, biggest edge first -- the caveat
  // names them specifically rather than gesturing at "the results", since
  // the whole point is that THIS gap is the unreliable number.
  const biasedWinners = verdict.comparisons
    .filter((c) => c.beatsBenchmark && isSelectionStrategy(c.id))
    .sort((a, b) => b.diffVsBenchmarkPts - a.diffVsBenchmarkPts);

  const top = biasedWinners[0];

  return (
    <div className="flex flex-col gap-3">
      <div className={`rounded-lg border p-4 ${styles.border}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
          <h2 className="font-semibold text-foreground">{verdict.headline}</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">{verdict.detail}</p>
      </div>

      {top && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <h3 className="text-sm font-semibold text-amber-200">
              Survivorship bias overstates this result
            </h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">
            The universe is <span className="text-zinc-100">today&rsquo;s</span>{" "}
            S&amp;P/TSX 60 constituents applied backwards across the whole window. Companies dropped from the index — acquired, delisted,
            or demoted — are missing entirely, so a strategy that ranks and buys past winners is selecting
            from a pool that has already been filtered for survival.{" "}
            <span className="text-zinc-100">
              {top.label}&rsquo;s {top.diffVsBenchmarkPts >= 0 ? "+" : ""}
              {top.diffVsBenchmarkPts.toFixed(1)}{" "}
              pt edge over Buy &amp; Hold is therefore overstated by an unknown amount
            </span>
            , and should not be read as a reliable estimate of real edge. Buy &amp; Hold holds that same
            filtered universe and is biased too — but selection strategies compound the bias, so the{" "}
            <em>gap</em> between them is inflated more than either figure on its own.
            {biasedWinners.length > 1 && (
              <>
                {" "}
                The same caveat applies to the other rank-and-select strategies shown above (
                {biasedWinners.slice(1).map((c) => c.label).join(", ")}).
              </>
            )}{" "}
            Quantifying the effect would require point-in-time index constituent data, which this project
            does not have.
          </p>
        </div>
      )}
    </div>
  );
}
