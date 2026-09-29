import type { IndexBenchmark } from "./market-data-types";

// Passive index benchmarks on the Strategies tab: what someone who bought one
// fund and did nothing would have ended up with, plotted beside the active
// strategies.
//
// These are NOT the same thing as the existing Buy & Hold line, and the page
// says so explicitly. Buy & Hold is an equal-weight basket of THIS universe's
// 51 names -- it answers "did the picking rules beat holding the same stocks".
// An index ETF is cap-weighted and is what a passive investor would actually
// own -- it answers "was any of this worth doing instead of buying a fund".

/** Muted, deliberately un-strategy-like hues: these lines are references, not
 *  competitors. Keyed by config.py's INDEX_BENCHMARKS key. */
const BENCHMARK_COLORS: Record<string, string> = {
  tsx60: "#94a3b8", // slate
  sp500_cad: "#e879f9", // fuchsia
};

const DEFAULT_BENCHMARK_COLOR = "#a1a1aa";

/** Distinct dash patterns so the benchmark lines stay separable even for a
 *  viewer who cannot rely on hue -- and so neither is mistaken for a
 *  strategy's solid line. Buy & Hold already uses "4 3". */
const BENCHMARK_DASHES: Record<string, string> = {
  tsx60: "8 4",
  sp500_cad: "1 4",
};

const DEFAULT_BENCHMARK_DASH = "6 3";

export function colorForBenchmark(key: string): string {
  return BENCHMARK_COLORS[key] ?? DEFAULT_BENCHMARK_COLOR;
}

export function dashForBenchmark(key: string): string {
  return BENCHMARK_DASHES[key] ?? DEFAULT_BENCHMARK_DASH;
}

export type BenchmarkOption = {
  /** Picker value. */
  value: string;
  label: string;
  /** Which index_benchmarks keys this option shows. */
  keys: string[];
};

/**
 * Picker options built FROM the data: "None", one entry per index benchmark
 * in the order config.py declares them, and a combined entry when there is
 * more than one. Adding or renaming a benchmark in config.py changes this
 * picker with no frontend edit.
 */
export function buildBenchmarkOptions(
  indexBenchmarks: Record<string, IndexBenchmark>,
): BenchmarkOption[] {
  const entries = Object.values(indexBenchmarks);
  const options: BenchmarkOption[] = [{ value: "none", label: "None", keys: [] }];

  for (const entry of entries) {
    options.push({ value: entry.key, label: entry.label, keys: [entry.key] });
  }

  if (entries.length > 1) {
    options.push({
      value: "all",
      label: entries.length === 2 ? "Both" : "All",
      keys: entries.map((e) => e.key),
    });
  }

  return options;
}

/** Default selection: the first benchmark config.py declares (the TSX 60 ETF),
 *  not a hardcoded key -- so reordering INDEX_BENCHMARKS moves the default. */
export function defaultBenchmarkValue(
  indexBenchmarks: Record<string, IndexBenchmark>,
): string {
  const first = Object.values(indexBenchmarks)[0];
  return first ? first.key : "none";
}

export function keysForBenchmarkValue(
  options: BenchmarkOption[],
  value: string,
): string[] {
  return options.find((o) => o.value === value)?.keys ?? [];
}
