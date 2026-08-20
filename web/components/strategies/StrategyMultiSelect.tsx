import type { StrategyResult } from "@/lib/types";
import { colorForStrategy } from "@/lib/strategy-colors";

export default function StrategyMultiSelect({
  strategies,
  order,
  selected,
  onChange,
}: {
  strategies: Record<string, StrategyResult>;
  order: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const selectedSet = new Set(selected);

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        Strategies
      </label>
      <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background/40 px-3 py-2">
        {order.map((id) => {
          const strategy = strategies[id];
          if (!strategy) return null;
          const active = selectedSet.has(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-pressed={active}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-zinc-600 bg-surface text-zinc-200"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorForStrategy(id), opacity: active ? 1 : 0.35 }}
              />
              {strategy.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
