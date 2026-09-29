import type { BenchmarkOption } from "@/lib/benchmarks";
import { colorForBenchmark } from "@/lib/benchmarks";

// Single-select, styled to match StrategyMultiSelect's chip row so the two
// controls read as one toolbar. Single-select rather than multi because the
// options are already exhaustive (None / each / Both) and a second
// multi-select beside the stock picker would be one toggle too many.
export default function BenchmarkPicker({
  options,
  value,
  onChange,
}: {
  options: BenchmarkOption[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        Index benchmark
      </label>
      <div
        role="radiogroup"
        aria-label="Index benchmark"
        className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background/40 px-3 py-2"
      >
        {options.map((option) => {
          const active = option.value === value;
          // "None" and the combined option have no single colour of their own;
          // the per-benchmark chips carry the line colour used on the chart.
          const dotColor =
            option.keys.length === 1 ? colorForBenchmark(option.keys[0]) : null;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-zinc-600 bg-surface text-zinc-200"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {dotColor && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor, opacity: active ? 1 : 0.35 }}
                />
              )}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
