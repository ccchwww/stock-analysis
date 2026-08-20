import type { Tone } from "@/lib/format";
import { toneTextClass } from "@/lib/format";

export default function StatCard({
  label,
  value,
  tone = "neutral",
  caption,
  explanation,
}: {
  label: string;
  value: string;
  tone?: Tone;
  caption?: string;
  /** One-line plain-language explanation of what this metric means. */
  explanation?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p
        className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${toneTextClass(tone)}`}
      >
        {value}
      </p>
      {caption && <p className="mt-1 text-xs text-zinc-500">{caption}</p>}
      {explanation && (
        <p className="mt-2 border-t border-border pt-2 text-xs leading-relaxed text-zinc-500">
          {explanation}
        </p>
      )}
    </div>
  );
}
