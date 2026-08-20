import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ResultsData } from "./types";

// results.json is written by backtest/momentum_backtest.py directly into
// web/public/, so we read it straight off disk instead of over HTTP.
export async function getResults(): Promise<ResultsData> {
  const filePath = path.join(process.cwd(), "public", "results.json");
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as ResultsData;
}
