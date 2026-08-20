import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RiskData } from "./risk-types";

// risk.json is written by backtest/risk_dashboard.py directly into
// web/public/, so we read it straight off disk instead of over HTTP.
export async function getRiskData(): Promise<RiskData> {
  const filePath = path.join(process.cwd(), "public", "risk.json");
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as RiskData;
}
