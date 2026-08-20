import { BASEL_ZONE_COLOR, type BaselZone } from "@/lib/var-backtest";

const ZONE_LABEL: Record<BaselZone, string> = { green: "Green", yellow: "Yellow", red: "Red" };

export default function BaselTrafficLight({
  basel,
}: {
  basel: { n: number; exceptions: number; scaledTo250: number; zone: BaselZone } | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">Basel Traffic Light</h2>
      <p className="mb-4 text-xs leading-relaxed text-zinc-500">
        Basel traffic-light zones are defined for 99% VaR over 250 observations. The 95% series shown above
        is for calibration testing only and is <span className="text-zinc-300">not</span> evaluated against
        these zones — at 95%, roughly 12.5 exceptions per 250 days is the <em>expected</em> result for a
        well-calibrated model, so applying these zones there would flag a correct model as red.
      </p>
      {basel ? (
        <div className="flex items-center gap-4">
          <span
            className="h-4 w-4 shrink-0 rounded-full"
            style={{
              backgroundColor: BASEL_ZONE_COLOR[basel.zone],
              boxShadow: `0 0 12px ${BASEL_ZONE_COLOR[basel.zone]}`,
            }}
          />
          <div>
            <p className="font-mono text-lg font-semibold" style={{ color: BASEL_ZONE_COLOR[basel.zone] }}>
              {ZONE_LABEL[basel.zone]}
            </p>
            <p className="text-xs text-zinc-500">
              {basel.exceptions} exceptions in {basel.n} observations → {basel.scaledTo250.toFixed(1)} scaled
              to 250 days (green ≤4, yellow 5–9, red ≥10)
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Not enough observations to classify.</p>
      )}
    </div>
  );
}
