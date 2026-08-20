"use client";

import { useState } from "react";
import type { ConfidenceLevel, MethodKey, VarBacktestResult } from "@/lib/var-backtest";
import type { ValidationMeta } from "@/lib/validation-types";
import VarChart from "./VarChart";
import VarStatCards from "./VarStatCards";
import VarComparisonTable from "./VarComparisonTable";
import BaselTrafficLight from "./BaselTrafficLight";
import ValidationAssumptions from "./ValidationAssumptions";

const METHOD_LABEL: Record<MethodKey, string> = { historical: "Historical", parametric: "Parametric" };
const METHODS: MethodKey[] = ["historical", "parametric"];
const CONFIDENCES: ConfidenceLevel[] = [0.95, 0.99];

export default function VarBacktestSection({
  targetLabel,
  result,
  validationMeta,
}: {
  targetLabel: string;
  result: VarBacktestResult;
  validationMeta: ValidationMeta;
}) {
  const [method, setMethod] = useState<MethodKey>("historical");
  const [confidence, setConfidence] = useState<ConfidenceLevel>(0.95);

  const selected = result.results.find((r) => r.method === method && r.confidence === confidence);
  if (!selected) return null; // results always has all 4 combos; defensive only

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">VaR Backtest — {targetLabel}</h2>
            <p className="text-xs text-zinc-500">
              Daily returns vs. the rolling {METHOD_LABEL[method].toLowerCase()} VaR threshold at{" "}
              {(confidence * 100).toFixed(0)}%. Red dots are exceptions — days the actual loss exceeded the
              VaR forecast.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex overflow-hidden rounded-md border border-border">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    method === m ? "bg-background text-foreground" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
            <div className="flex overflow-hidden rounded-md border border-border">
              {CONFIDENCES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setConfidence(c)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    confidence === c ? "bg-background text-foreground" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {(c * 100).toFixed(0)}%
                </button>
              ))}
            </div>
          </div>
        </div>
        <VarChart chartPoints={result.chartPoints} method={method} confidence={confidence} />
      </div>

      <VarStatCards selected={selected} skewness={result.skewness} excessKurtosis={result.excessKurtosis} />

      <VarComparisonTable results={result.results} />

      <BaselTrafficLight basel={result.basel} />

      <ValidationAssumptions meta={validationMeta} />
    </div>
  );
}
