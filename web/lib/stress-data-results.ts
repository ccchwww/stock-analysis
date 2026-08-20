import { readFile } from "node:fs/promises";
import path from "node:path";
import type { StressData } from "./stress-data-types";

// stress_data.json is written by backtest/stress_data.py directly into
// web/public/, so we read it straight off disk instead of over HTTP.
export async function getStressData(): Promise<StressData> {
  const filePath = path.join(process.cwd(), "public", "stress_data.json");
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as StressData;
}
