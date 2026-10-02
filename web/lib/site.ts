// Single place for the project's external links and authorship, so a repo
// rename or a profile change is a one-line edit rather than a grep.

export const SITE = {
  name: "QuantRisk",
  tagline: "Backtesting, risk analytics & model validation for Canadian large-cap stocks",
} as const;

// The deployed origin, in ONE place. It is the metadataBase for every
// page's Open Graph / Twitter card (app/layout.tsx), so link previews
// resolve against it, and the README points at the same address. Change
// this single line after renaming the Vercel domain and everything follows.
// No trailing slash.
export const SITE_URL = "https://stock-analysis-ten-ecru.vercel.app";

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

/**
 * Per-tab metadata. A page that sets only `title` gets the "%s · QuantRisk"
 * template applied to its <title>, but NOT to its Open Graph / Twitter
 * titles: those come from the openGraph/twitter blocks in app/layout.tsx,
 * and a child segment has to opt in by setting them. Without this, every
 * shared link previews as the bare site name regardless of which tab it
 * points at. One helper so the three stay in sync.
 */
export function pageMetadata(title: string) {
  return { title, openGraph: { title }, twitter: { title } };
}

/** True while a constant above is still an unfilled TODO. The home page
 * renders those as plain text instead of a link, so a placeholder never
 * ships as a broken href -- the label stays visible as the reminder. */
export function isPlaceholder(value: string): boolean {
  return value.startsWith("TODO:");
}
