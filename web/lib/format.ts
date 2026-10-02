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

// e.g. 0.711 -> "+71.1 pts". The DIFFERENCE between two percentages is
// measured in percentage points, not percent -- writing it as "+71.1%" reads
// as a relative change, which is a different (and much smaller) number.
export function formatSignedPoints(fraction: number, digits = 1): string {
  const pts = fraction * 100;
  const sign = pts > 0 ? "+" : "";
  return `${sign}${pts.toFixed(digits)} pts`;
}

// e.g. 0.00064 -> "+0.064%", -0.0027 -> "-0.270%"
export function formatSignedPct(fraction: number, digits = 3): string {
  const pct = fraction * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}
