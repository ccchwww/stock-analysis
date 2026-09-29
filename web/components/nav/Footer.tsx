import Link from "next/link";
import { getMarketData } from "@/lib/market-data-results";
import DataFreshnessBadge from "./DataFreshnessBadge";

// The "Data as of" stamp comes from market_data.json's OWN date_range.end --
// i.e. the last date yfinance actually returned data for -- never a
// hardcoded string and never the file's mtime. This is a Server Component
// reading the file fresh at build time, so the daily refresh workflow
// (.github/workflows/refresh-data.yml) keeps it correct with no changes
// here: each successful refresh commits new JSON, Vercel redeploys, and the
// stamp follows.
//
// The staleness badge beside it deliberately does NOT work that way -- see
// DataFreshnessBadge for why that comparison has to run in the browser.
export default async function Footer() {
  const marketData = await getMarketData();
  const asOf = marketData.meta.date_range.end;

  return (
    <footer className="border-t border-border py-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-1.5 px-4 text-xs text-zinc-500 sm:flex-row sm:justify-between sm:px-6">
        <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span>Data as of {asOf} · updated daily after TSX close</span>
          <DataFreshnessBadge asOf={asOf} />
        </span>
        <Link href="/assumptions" className="underline decoration-zinc-700 hover:text-zinc-300">
          Assumptions &amp; Limitations
        </Link>
      </div>
    </footer>
  );
}
