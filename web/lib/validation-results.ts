import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ValidationData } from "./validation-types";

// validation.json is written by backtest/validation.py directly into
// web/public/, so we read it straight off disk instead of over HTTP.
export async function getValidationData(): Promise<ValidationData> {
  const filePath = path.join(process.cwd(), "public", "validation.json");
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as ValidationData;
}
