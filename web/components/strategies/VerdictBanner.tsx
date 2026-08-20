import type { Verdict } from "@/lib/verdict";

const TONE_STYLES: Record<Verdict["tone"], { border: string; dot: string }> = {
  positive: { border: "border-emerald-500/40 bg-emerald-500/5", dot: "bg-emerald-400" },
  negative: { border: "border-red-500/40 bg-red-500/5", dot: "bg-red-400" },
  neutral: { border: "border-amber-500/40 bg-amber-500/5", dot: "bg-amber-400" },
};

export default function VerdictBanner({ verdict }: { verdict: Verdict }) {
  const styles = TONE_STYLES[verdict.tone];

  return (
    <div className={`rounded-lg border p-4 ${styles.border}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
        <h2 className="font-semibold text-foreground">{verdict.headline}</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">{verdict.detail}</p>
    </div>
  );
}
