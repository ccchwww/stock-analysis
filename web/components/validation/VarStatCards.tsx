import StatCard from "@/components/shared/StatCard";
import type { LikelihoodRatioTest, SeriesTestResult } from "@/lib/var-backtest";
import { formatPct } from "@/lib/format";

function TestCard({ label, test, explanation }: { label: string; test: LikelihoodRatioTest; explanation: string }) {
  return (
    <StatCard
      label={label}
      value={test.reject ? "Reject" : "Pass"}
      tone={test.reject ? "negative" : "positive"}
      caption={`stat ${test.statistic.toFixed(2)} · p=${test.pValue.toFixed(4)} (crit ${test.criticalValue})`}
      explanation={explanation}
    />
  );
}

export default function VarStatCards({
  selected,
  skewness,
  excessKurtosis,
}: {
  selected: SeriesTestResult;
  skewness: number | null;
  excessKurtosis: number | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label="Exception Rate"
        value={formatPct(selected.exceptionRate, 2)}
        tone={selected.kupiec.reject ? "negative" : "positive"}
        caption={`${selected.exceptions} of ${selected.n} days · expected ~${selected.expectedExceptions.toFixed(1)}`}
        explanation="How often the actual loss exceeded the VaR threshold. For a well-calibrated model this should land close to the nominal rate (5% at 95% confidence, 1% at 99%) — not much more, and not suspiciously less either."
      />
      <TestCard
        label="Kupiec Test (Coverage)"
        test={selected.kupiec}
        explanation='Tests whether the OVERALL exception rate matches the nominal rate, ignoring WHEN exceptions happened. "Reject" means the observed rate is statistically too far from the nominal rate to be explained by chance.'
      />
      <TestCard
        label="Christoffersen Test (Independence)"
        test={selected.christoffersen}
        explanation='Tests whether exceptions cluster in time (several breaches during one crisis) instead of scattering independently. "Reject" means breaches are NOT independent — a red flag even when the overall rate looks fine, since risk wasn&rsquo;t being priced correctly during the periods that mattered most.'
      />
      <TestCard
        label="Conditional Coverage"
        test={selected.conditionalCoverage}
        explanation='Joint test of both properties at once (correct rate AND independence). "Reject" here means at least one of the two tests above is failing.'
      />
      <StatCard
        label="Skewness"
        value={skewness !== null ? skewness.toFixed(3) : "n/a"}
        caption={
          skewness === null
            ? undefined
            : skewness < 0
              ? "left-skewed: a longer loss tail"
              : skewness > 0
                ? "right-skewed: a longer gain tail"
                : "symmetric"
        }
        explanation="Asymmetry of the return distribution. 0 = symmetric; negative (typical for equities) means extreme losses are bigger or more frequent than extreme gains."
      />
      <StatCard
        label="Excess Kurtosis"
        value={excessKurtosis !== null ? excessKurtosis.toFixed(3) : "n/a"}
        tone={excessKurtosis !== null && excessKurtosis > 1 ? "negative" : "neutral"}
        caption="a normal distribution has excess kurtosis 0"
        explanation="How fat the tails are relative to a normal distribution. Positive means extreme days (either direction) are more common than a normal-distribution model would predict — exactly why parametric VaR, which assumes normality, tends to get breached more often than historical VaR."
      />
    </div>
  );
}
