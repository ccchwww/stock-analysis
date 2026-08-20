"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EquityPoint } from "@/lib/types";
import { buildEquityChartData } from "@/lib/equity-chart-data";

export type ChartSeries = {
  id: string;
  label: string;
  color: string;
  equityCurve: EquityPoint[];
  dashed?: boolean;
  strokeWidth?: number;
};

function formatDateTick(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function formatDollars(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function EquityChart({ series }: { series: ChartSeries[] }) {
  const data = buildEquityChartData(
    series.map((s) => ({ id: s.id, equityCurve: s.equityCurve })),
  );
  const labelById = Object.fromEntries(series.map((s) => [s.id, s.label]));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">Growth of $10,000</h2>
      <p className="mb-4 text-xs text-zinc-500">
        Equity curve per selection, sampled weekly over the full test window.
      </p>
      {series.length === 0 ? (
        <div className="flex h-80 items-center justify-center text-sm text-zinc-500 sm:h-96">
          Select a strategy or stock below to plot its growth curve.
        </div>
      ) : (
        <div className="h-80 w-full sm:h-96">
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
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={{ stroke: "#232b38" }}
                tickLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: "#11161d",
                  border: "1px solid #232b38",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#e4e7eb", marginBottom: 4 }}
                formatter={(value, name) => [
                  formatDollars(Number(value)),
                  labelById[String(name)] ?? String(name),
                ]}
              />
              <Legend
                formatter={(value) => (
                  <span className="text-zinc-400">{labelById[value] ?? value}</span>
                )}
                wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
              />
              {series.map((s) => (
                <Line
                  key={s.id}
                  type="monotone"
                  dataKey={s.id}
                  name={s.id}
                  stroke={s.color}
                  strokeWidth={s.strokeWidth ?? 2}
                  strokeDasharray={s.dashed ? "4 3" : undefined}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
