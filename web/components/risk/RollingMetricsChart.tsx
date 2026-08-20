"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RollingChartRow } from "@/lib/rolling-chart-data";

export type RollingLineSeries = { id: string; label: string; color: string };

function formatDateTick(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export default function RollingMetricsChart({
  title,
  description,
  data,
  series,
  yTickFormatter,
  tooltipFormatter,
  referenceLine,
}: {
  title: string;
  description: string;
  data: RollingChartRow[];
  series: RollingLineSeries[];
  yTickFormatter: (value: number) => string;
  tooltipFormatter: (value: number) => string;
  referenceLine?: { value: number; label: string };
}) {
  const labelById = Object.fromEntries(series.map((s) => [s.id, s.label]));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mb-4 text-xs text-zinc-500">{description}</p>
      {series.length === 0 || data.length === 0 ? (
        <div className="flex h-56 items-center justify-center text-sm text-zinc-500">
          Select one or more stocks above to see this chart.
        </div>
      ) : (
        <div className="h-56 w-full sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
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
                tickFormatter={yTickFormatter}
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={{ stroke: "#232b38" }}
                tickLine={false}
                width={48}
              />
              {referenceLine && (
                <ReferenceLine
                  y={referenceLine.value}
                  stroke="#52525b"
                  strokeDasharray="4 3"
                  label={{
                    value: referenceLine.label,
                    position: "insideTopLeft",
                    fill: "#71717a",
                    fontSize: 10,
                  }}
                />
              )}
              <Tooltip
                contentStyle={{
                  background: "#11161d",
                  border: "1px solid #232b38",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#e4e7eb", marginBottom: 4 }}
                formatter={(value, name) => [
                  value === null || value === undefined ? "n/a" : tooltipFormatter(Number(value)),
                  labelById[String(name)] ?? String(name),
                ]}
              />
              {series.length > 1 && (
                <Legend
                  formatter={(value) => (
                    <span className="text-zinc-400">{labelById[value] ?? value}</span>
                  )}
                  wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                />
              )}
              {series.map((s) => (
                <Line
                  key={s.id}
                  type="monotone"
                  dataKey={s.id}
                  name={s.id}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  // connectNulls intentionally left at its default (false):
                  // the warm-up period before the window fills, and any data
                  // gap, must render as a gap -- not a flat/zero line.
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
