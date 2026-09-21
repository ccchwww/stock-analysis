import type { ValidationMeta } from "@/lib/validation-types";

export default function ValidationAssumptions({ meta }: { meta: ValidationMeta }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Assumptions &amp; Caveats
      </h2>
      <ul className="flex flex-col gap-1.5 text-sm text-zinc-400">
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <span>{meta.methodology_note}</span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <span>{meta.warmup_note}</span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <span>{meta.basel_note}</span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <span>{meta.basel_scaling_note}</span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <span>{meta.fat_tail_note}</span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <span>
            {`Each likelihood-ratio test is evaluated at 5% significance (chi-square critical values ${meta.chi2_critical_95.df1} at 1 degree of freedom, ${meta.chi2_critical_95.df2} at 2). A "pass" only means the data doesn't give strong evidence against the model at this sample size — it isn't proof the model is correct, especially over a short backtest window.`}
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <span>
            Exceptions on days with missing data (a gap in that stock&rsquo;s price history) are skipped
            entirely rather than counted as a hit or a miss — consistent with how every other metric on this
            site treats missing data.
          </span>
        </li>
      </ul>
    </div>
  );
}
