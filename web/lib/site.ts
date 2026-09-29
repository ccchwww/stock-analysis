// Single place for the project's external links and authorship, so a repo
// rename or a profile change is a one-line edit rather than a grep.

export const SITE = {
  name: "QuantRisk",
  tagline: "Backtesting, risk analytics & model validation for Canadian large-cap stocks",
} as const;

// Kept as one constant because the repo is likely to be renamed to match
// the project (stock-analysis -> quantrisk); update this line and every
// link to the docs follows.
export const REPO_URL = "https://github.com/ccchwww/stock-analysis";
export const MODEL_DOC_URL = `${REPO_URL}/blob/main/MODEL_DOCUMENTATION.md`;

// TODO: fill these in.
export const AUTHOR = {
  name: "TODO: Your Name",
  github: "https://github.com/ccchwww",
  linkedin: "TODO: https://www.linkedin.com/in/your-handle/",
} as const;

/** True while a constant above is still an unfilled TODO. The home page
 * renders those as plain text instead of a link, so a placeholder never
 * ships as a broken href -- the label stays visible as the reminder. */
export function isPlaceholder(value: string): boolean {
  return value.startsWith("TODO:");
}
