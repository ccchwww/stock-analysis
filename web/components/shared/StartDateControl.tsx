"use client";

export default function StartDateControl({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min: string;
  max: string;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        Start Date
      </label>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="min-h-[42px] w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm text-zinc-200 [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
      />
      <p className="mt-1.5 text-xs text-zinc-600">
        Results depend on the start date chosen — different windows capture
        different market regimes. This is a known sensitivity, not a bug.
      </p>
    </div>
  );
}
