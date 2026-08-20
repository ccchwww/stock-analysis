"use client";

import type { TooltipContentProps } from "recharts";
import {
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FrontierPoint } from "@/lib/efficient-frontier";
import { formatPct } from "@/lib/format";
import { colorForTicker } from "@/lib/stock-colors";

const CLOUD_COLOR = "rgba(161, 161, 170, 0.35)"; // zinc-400 @ low opacity -- recedes behind the frontier/markers
const FRONTIER_COLOR = "#38bdf8"; // sky
const MIN_VAR_COLOR = "#a78bfa"; // violet
const MAX_SHARPE_COLOR = "#fbbf24"; // amber -- same "highlight" color used for the blended portfolio elsewhere
const NEGLIGIBLE_WEIGHT = 0.005; // below 0.5%, omitted from the tooltip breakdown -- corner portfolios routinely zero out most names

type ScatterPoint = { volatility: number; expectedReturn: number; sharpe: number; weights: number[] };

function toScatterPoint(p: FrontierPoint): ScatterPoint {
  return { volatility: p.volatility, expectedReturn: p.expectedReturn, sharpe: p.sharpe, weights: p.weights };
}

// Custom tooltip content so hovering ANY point (cloud or frontier) shows the
// actual portfolio behind it: risk/return/Sharpe plus which stocks make it
// up and in what proportion -- the default recharts tooltip only surfaces
// the x/y values it's plotting, not the weight vector riding along with them.
function FrontierTooltip({
  active,
  payload,
  tickers,
  names,
}: TooltipContentProps & { tickers: string[]; names: Record<string, string> }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as ScatterPoint | undefined;
  if (!point) return null;

  const holdings = tickers
    .map((ticker, i) => ({ ticker, weight: point.weights[i] ?? 0 }))
    .filter((h) => h.weight >= NEGLIGIBLE_WEIGHT)
    .sort((a, b) => b.weight - a.weight);

  return (
    <div
      style={{
        background: "#11161d",
        border: "1px solid #232b38",
        borderRadius: 8,
        fontSize: 12,
        padding: "8px 10px",
        maxWidth: 220,
      }}
    >
      <div style={{ color: "#e4e7eb", marginBottom: 4 }}>
        {formatPct(point.volatility, 1)} volatility · {formatPct(point.expectedReturn, 1)} return
      </div>
      <div style={{ color: "#a1a1aa", marginBottom: holdings.length > 0 ? 6 : 0 }}>
        Sharpe {point.sharpe.toFixed(2)}
      </div>
      {holdings.map((h) => (
        <div key={h.ticker} style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "#d4d4d8" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                flexShrink: 0,
                backgroundColor: colorForTicker(h.ticker),
              }}
            />
            <span style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }}>
              {h.ticker}
            </span>
          </span>
          <span style={{ fontFamily: "monospace", flexShrink: 0 }}>{formatPct(h.weight, 1)}</span>
        </div>
      ))}
      {holdings.length === 0 && (
        <div style={{ color: "#71717a" }} title={names[tickers[0]] ?? ""}>
          No weights above {formatPct(NEGLIGIBLE_WEIGHT, 1)}
        </div>
      )}
    </div>
  );
}

export default function EfficientFrontierChart({
  tickers,
  names,
  cloud,
  frontier,
  minVariance,
  maxSharpe,
}: {
  tickers: string[];
  names: Record<string, string>;
  cloud: FrontierPoint[];
  frontier: FrontierPoint[];
  minVariance: FrontierPoint;
  maxSharpe: FrontierPoint;
}) {
  const cloudData = cloud.map(toScatterPoint);
  const frontierData = frontier.map(toScatterPoint);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-zinc-500/70" />
          Random long-only portfolios
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: FRONTIER_COLOR }} />
          Efficient frontier
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: MIN_VAR_COLOR }} />
          Minimum variance
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: MAX_SHARPE_COLOR }} />
          Maximum Sharpe
        </span>
      </div>
      <div className="h-80 w-full sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 4, right: 12, left: 0, bottom: 24 }}>
            <CartesianGrid stroke="#232b38" strokeDasharray="3 3" />
            <XAxis
              dataKey="volatility"
              type="number"
              name="Volatility"
              tickFormatter={(v: number) => formatPct(v, 0)}
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={{ stroke: "#232b38" }}
              tickLine={false}
              label={{
                value: "Annualized Volatility (risk)",
                position: "bottom",
                offset: 4,
                fill: "#71717a",
                fontSize: 11,
              }}
            />
            <YAxis
              dataKey="expectedReturn"
              type="number"
              name="Expected Return"
              tickFormatter={(v: number) => formatPct(v, 0)}
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={{ stroke: "#232b38" }}
              tickLine={false}
              width={52}
              label={{
                value: "Expected Return",
                angle: -90,
                position: "insideLeft",
                fill: "#71717a",
                fontSize: 11,
              }}
            />
            <Tooltip content={(props) => <FrontierTooltip {...props} tickers={tickers} names={names} />} cursor={{ stroke: "#232b38" }} />
            <Scatter name="Random Cloud" data={cloudData} fill={CLOUD_COLOR} isAnimationActive={false} shape="circle" />
            <Scatter
              name="Frontier"
              data={frontierData}
              fill={FRONTIER_COLOR}
              line={{ stroke: FRONTIER_COLOR, strokeWidth: 2 }}
              lineType="joint"
              shape="circle"
              isAnimationActive={false}
              legendType="none"
            />
            <ReferenceDot
              x={minVariance.volatility}
              y={minVariance.expectedReturn}
              r={6}
              fill={MIN_VAR_COLOR}
              stroke="#0b0f14"
              strokeWidth={2}
              zIndex={10}
              label={{ value: "Min Variance", position: "left", fill: MIN_VAR_COLOR, fontSize: 11 }}
            />
            <ReferenceDot
              x={maxSharpe.volatility}
              y={maxSharpe.expectedReturn}
              r={6}
              fill={MAX_SHARPE_COLOR}
              stroke="#0b0f14"
              strokeWidth={2}
              zIndex={10}
              label={{ value: "Max Sharpe", position: "right", fill: MAX_SHARPE_COLOR, fontSize: 11 }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
