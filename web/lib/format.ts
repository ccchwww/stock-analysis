export type Tone = "positive" | "negative" | "neutral";

export function toneOf(value: number): Tone {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

export function toneTextClass(tone: Tone): string {
  switch (tone) {
    case "positive":
      return "text-emerald-400";
    case "negative":
      return "text-red-400";
    default:
      return "text-zinc-300";
  }
}

// e.g. 0.5248 -> "52.5%"
export function formatPct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

// e.g. 0.00064 -> "+0.064%", -0.0027 -> "-0.270%"
export function formatSignedPct(fraction: number, digits = 3): string {
  const pct = fraction * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}
