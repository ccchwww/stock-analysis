// Deterministic, evenly-spread color per ticker so any of the ~60 TSX names
// gets a consistent, visually distinct color without a hand-authored palette.
// Hue steps by the golden angle from a hash of the ticker, which spreads
// hues around the wheel evenly instead of clustering for similar strings.
const GOLDEN_ANGLE = 137.508;

// Approximate hues of the fixed strategy/portfolio colors (strategy-colors.ts
// and StrategyExplorer's PORTFOLIO_COLOR) -- a hashed ticker hue this close to
// one of these would be visually confusable with it, so we nudge it away.
const RESERVED_HUES = [199, 256, 25, 152, 43];
const MIN_HUE_DISTANCE = 18;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function circularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function colorForTicker(ticker: string): string {
  let hue = (hashString(ticker) * GOLDEN_ANGLE) % 360;

  for (const reserved of RESERVED_HUES) {
    if (circularDistance(hue, reserved) < MIN_HUE_DISTANCE) {
      hue = (reserved + MIN_HUE_DISTANCE + 5) % 360;
    }
  }

  return `hsl(${hue.toFixed(1)}, 65%, 60%)`;
}
