import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MarketData } from "./market-data-types";

// market_data.json is written by backtest/market_data.py directly into
// web/public/, so we read it straight off disk instead of over HTTP.
export async function getMarketData(): Promise<MarketData> {
  const filePath = path.join(process.cwd(), "public", "market_data.json");
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as MarketData;
}
