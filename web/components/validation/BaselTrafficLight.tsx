"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BASEL_ZONE_COLOR, type BaselResult, type BaselWindow, type BaselZone } from "@/lib/var-backtest";

const ZONE_LABEL: Record<BaselZone, string> = { green: "Green", yellow: "Yellow", red: "Red" };

function formatDateTick(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function ZoneDot({ zone }: { zone: BaselZone }) {
  return (
    <span
      className="h-4 w-4 shrink-0 rounded-full"
      style={{ backgroundColor: BASEL_ZONE_COLOR[zone], boxShadow: `0 0 12px ${BASEL_ZONE_COLOR[zone]}` }}
    />
  );
}

function WindowBlock({ title, window }: { title: string; window: BaselWindow }) {
  return (
    <div className="flex items-center gap-4">
      <ZoneDot zone={window.zone} />
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</p>
        <p className="font-mono text-lg font-semibold" style={{ color: BASEL_ZONE_COLOR[window.zone] }}>
          {ZONE_LABEL[window.zone]}
        </p>
        <p className="text-xs text-zinc-500">
          {window.exceptions} {window.exceptions === 1 ? "exception" : "exceptions"} in {window.n} observations
          ({window.startDate} → {window.endDate})
        </p>
      </div>
    </div>
  );
}

export default function BaselTrafficLight({ basel }: { basel: BaselResult | null }) {
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
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <WindowBlock title="Trailing 250 Observations" window={basel.trailing} />
            <WindowBlock title="Worst 250-Observation Window" window={basel.worst} />
          </div>

          {basel.zonesDiffer && (
            <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-300">
              The trailing window and the worst historical window fall in <strong>different zones</strong>. That
              gap is the clustering finding: exceptions are not spread evenly through time, so a snapshot taken
              at a different point in the backtest can look meaningfully better or worse than what actually
              happened during the roughest stretch.
            </p>
          )}

          {basel.rollingSeries.length > 1 && (
            <div>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={basel.rollingSeries} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke="#232b38" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateTick}
                      tick={{ fill: "#71717a", fontSize: 11 }}
                      axisLine={{ stroke: "#232b38" }}
                      tickLine={false}
                      minTickGap={40}
                    />
                    <YAxis
                      tick={{ fill: "#71717a", fontSize: 11 }}
                      axisLine={{ stroke: "#232b38" }}
                      tickLine={false}
                      width={28}
                      allowDecimals={false}
                      // Always show at least up to the red threshold, so the 5
                      // and 10 reference lines the caption promises are on
                      // screen even when the count never gets near them --
                      // "the count stayed well below both thresholds" is
                      // itself the useful reading of this chart. Ticks are
                      // pinned to the two zone boundaries (plus 0 and the top)
                      // rather than auto-computed, which otherwise yields
                      // uneven spacing like 0/3/6/10 once the domain is
                      // clamped.
                      domain={[0, (max: number) => Math.max(10, Math.ceil(max))]}
                      ticks={[0, 5, 10]}
                    />
                    <ReferenceLine
                      y={5}
                      stroke="#fbbf24"
                      strokeDasharray="4 3"
                      label={{ value: "yellow 5", position: "insideTopRight", fill: "#fbbf24", fontSize: 10 }}
                    />
                    <ReferenceLine
                      y={10}
                      stroke="#f87171"
                      strokeDasharray="4 3"
                      label={{ value: "red 10", position: "insideTopRight", fill: "#f87171", fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{ background: "#11161d", border: "1px solid #232b38", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "#e4e7eb", marginBottom: 4 }}
                      formatter={(value) => [`${value} exceptions`, "Trailing 250-obs count"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#38bdf8"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                Rolling trailing-250-observation exception count over the whole backtest. Dashed lines mark the
                yellow (5) and red (10) Basel thresholds.
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Not enough observations to classify.</p>
      )}
    </div>
  );
}
