"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ConfidenceLevel, MethodKey, VarChartPoint } from "@/lib/var-backtest";
import { formatPct } from "@/lib/format";

const RETURN_COLOR = "#71717a"; // zinc -- recessive, the VaR line + exception dots should pop
const VAR_LINE_COLOR = "#38bdf8"; // sky
const EXCEPTION_COLOR = "#f87171"; // red

type ChartRow = {
  date: string;
  actualReturn: number | null;
  varLowerBound: number | null;
  exceptionReturn: number | null;
};

function fieldFor(method: MethodKey, confidence: ConfidenceLevel): keyof VarChartPoint {
  if (method === "historical") return confidence === 0.95 ? "varHist95" : "varHist99";
  return confidence === 0.95 ? "varParam95" : "varParam99";
}

function formatDateTick(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export default function VarChart({
  chartPoints,
  method,
  confidence,
}: {
  chartPoints: VarChartPoint[];
  method: MethodKey;
  confidence: ConfidenceLevel;
}) {
  const field = fieldFor(method, confidence);

  const data: ChartRow[] = chartPoints.map((p) => {
    const varValue = p[field] as number | null;
    const varLowerBound = varValue !== null ? -varValue : null;
    const isException = p.actualReturn !== null && varValue !== null && p.actualReturn < -varValue;
    return {
      date: p.date,
      actualReturn: p.actualReturn,
      varLowerBound,
      exceptionReturn: isException ? p.actualReturn : null,
    };
  });

  return (
    <div className="h-80 w-full sm:h-96">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 24 }}>
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
            tickFormatter={(v: number) => formatPct(v, 1)}
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={{ stroke: "#232b38" }}
            tickLine={false}
            width={56}
          />
          <ReferenceLine y={0} stroke="#3f4757" />
          <Tooltip
            contentStyle={{
              background: "#11161d",
              border: "1px solid #232b38",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#e4e7eb", marginBottom: 4 }}
            formatter={(value, name) => {
              if (value === null || value === undefined) return ["n/a", String(name)];
              const num = Number(value);
              if (name === "actualReturn") return [formatPct(num, 2), "Actual return"];
              if (name === "varLowerBound") return [formatPct(num, 2), "VaR threshold"];
              if (name === "exceptionReturn") return [formatPct(num, 2), "Exception"];
              return [formatPct(num, 2), String(name)];
            }}
          />
          <Line
            type="monotone"
            dataKey="actualReturn"
            stroke={RETURN_COLOR}
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="varLowerBound"
            stroke={VAR_LINE_COLOR}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Scatter dataKey="exceptionReturn" fill={EXCEPTION_COLOR} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
