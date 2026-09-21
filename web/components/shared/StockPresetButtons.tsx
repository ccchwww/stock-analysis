"use client";

import { STOCK_PRESETS, isPresetActive } from "@/lib/stock-presets";

export default function StockPresetButtons({
  selected,
  onChange,
  available,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  /** Filters each preset to tickers actually present in the loaded data. */
  available?: (ticker: string) => boolean;
}) {
  const presets = STOCK_PRESETS.map((p) => ({
    ...p,
    tickers: available ? p.tickers.filter(available) : p.tickers,
  })).filter((p) => p.tickers.length >= 2);

  const active = presets.find((p) => isPresetActive(p, selected));

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">Presets</p>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const isActive = active?.key === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => onChange(preset.tickers)}
              title={preset.note}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                  : "border-border text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      {active && <p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-500">{active.note}</p>}
    </div>
  );
}
