export default function PortfolioToggle({
  checked,
  onChange,
  disabled,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Combine
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`flex min-h-[42px] items-center gap-2.5 whitespace-nowrap rounded-lg border px-3 py-2 text-sm transition-colors ${
          disabled
            ? "cursor-not-allowed border-border bg-background/40 text-zinc-600"
            : "border-border bg-background/40 text-zinc-300 hover:border-zinc-600"
        }`}
      >
        <span
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
            checked ? "bg-emerald-500" : "bg-zinc-700"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
              checked ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </span>
        <span>as portfolio</span>
      </button>
      {hint && <span className="text-xs text-zinc-600">{hint}</span>}
    </div>
  );
}
