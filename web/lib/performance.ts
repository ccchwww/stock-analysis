import type { EquityPoint } from "./types";

export type CurveSummary = {
  totalReturn: number;
  finalValue: number;
  cagr: number | null;
  years: number;
};

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function yearsBetween(startDate: string, endDate: string): number {
  return (new Date(endDate).getTime() - new Date(startDate).getTime()) / MS_PER_YEAR;
}

// Proper CAGR: the constant annual growth rate that compounds from initial
// to final value over the elapsed time -- NOT total return divided by years.
export function computeCagr(
  initialValue: number,
  finalValue: number,
  startDate: string,
  endDate: string,
): number | null {
  if (initialValue <= 0 || finalValue <= 0) return null;
  const years = yearsBetween(startDate, endDate);
  if (years <= 0) return null;
  return Math.pow(finalValue / initialValue, 1 / years) - 1;
}

export function summarizeCurve(
  curve: EquityPoint[],
  initialCapital: number,
): CurveSummary | null {
  if (curve.length < 2) return null;
  const first = curve[0];
  const last = curve[curve.length - 1];
  return {
    totalReturn: last.value / initialCapital - 1,
    finalValue: last.value,
    cagr: computeCagr(initialCapital, last.value, first.date, last.date),
    years: yearsBetween(first.date, last.date),
  };
}
