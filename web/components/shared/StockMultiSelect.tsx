"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { colorForTicker } from "@/lib/stock-colors";
import { tickerWithName } from "@/lib/ticker-label";

export type SelectableStock = {
  ticker: string;
  name: string;
};

export default function StockMultiSelect({
  stocks,
  selected,
  onChange,
}: {
  stocks: SelectableStock[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const byTicker = useMemo(
    () => new Map(stocks.map((s) => [s.ticker, s])),
    [stocks],
  );

  // Searchable by ticker OR company name, e.g. "royal" and "RY" both find
  // Royal Bank of Canada.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stocks;
    return stocks.filter(
      (s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    );
  }, [stocks, query]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggle(ticker: string) {
    if (selectedSet.has(ticker)) {
      onChange(selected.filter((t) => t !== ticker));
    } else {
      onChange([...selected, ticker]);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        Stocks
      </label>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="flex min-h-[42px] w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-600"
      >
        {selected.length === 0 ? (
          <span className="text-zinc-500">Add individual stocks…</span>
        ) : (
          selected.map((ticker) => (
            <span
              key={ticker}
              title={tickerWithName(ticker, byTicker.get(ticker)?.name)}
              className="inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 font-mono text-xs"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: colorForTicker(ticker) }}
              />
              {ticker}
              <button
                type="button"
                aria-label={`Remove ${ticker}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(ticker);
                }}
                className="ml-0.5 text-zinc-500 hover:text-zinc-200"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full min-w-[280px] rounded-lg border border-border bg-surface shadow-xl">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticker or company name…"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-zinc-500">No matches</p>
            )}
            {filtered.map((stock) => (
              <label
                key={stock.ticker}
                title={tickerWithName(stock.ticker, stock.name)}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-background/60"
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(stock.ticker)}
                  onChange={() => toggle(stock.ticker)}
                  className="accent-emerald-500 shrink-0"
                />
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorForTicker(stock.ticker) }}
                />
                <span className="shrink-0 font-mono">{stock.ticker}</span>
                <span className="truncate text-zinc-500">— {stock.name}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Clear all ({selected.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
