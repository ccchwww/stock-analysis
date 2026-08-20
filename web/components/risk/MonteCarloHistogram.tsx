"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistogramBin } from "@/lib/monte-carlo";

function formatDollarsShort(value: number): string {
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

export default function MonteCarloHistogram({
  bins,
  initialAmount,
}: {
  bins: HistogramBin[];
  initialAmount: number;
}) {
  const mids = bins.map((bin) => (bin.binStart + bin.binEnd) / 2);
  const data = bins.map((bin, i) => ({
    label: formatDollarsShort(mids[i]),
    count: bin.count,
  }));

  const markerIndex = mids.reduce(
    (bestIndex, mid, i) =>
      Math.abs(mid - initialAmount) < Math.abs(mids[bestIndex] - initialAmount) ? i : bestIndex,
    0,
  );

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Distribution of Simulated Outcomes
        </p>
        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          bin closest to initial amount
        </p>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#232b38" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#71717a", fontSize: 10 }}
              axisLine={{ stroke: "#232b38" }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: 10 }}
              axisLine={{ stroke: "#232b38" }}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: "#11161d",
                border: "1px solid #232b38",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#e4e7eb" }}
              formatter={(value) => [`${value}`, "Simulated paths"]}
            />
            <Bar dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {data.map((_, i) => (
                <Cell key={i} fill={i === markerIndex ? "#fbbf24" : "#38bdf8"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
