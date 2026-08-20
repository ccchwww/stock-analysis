import Link from "next/link";
import { getMarketData } from "@/lib/market-data-results";

// The "Data as of" stamp comes from market_data.json's OWN date_range.end --
// i.e. the last date yfinance actually returned data for -- never a
// hardcoded string and never the file's mtime. Once data generation is
// automated (see MODEL_DOCUMENTATION.md's remediation table), this stays
// correct with no further changes: each new deploy re-reads whatever the
// latest regenerated JSON says, since this is a Server Component reading
// the file fresh, not a value baked in by hand.
export default async function Footer() {
  const marketData = await getMarketData();

  return (
    <footer className="border-t border-border py-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-1.5 px-4 text-xs text-zinc-500 sm:flex-row sm:justify-between sm:px-6">
        <span>Data as of {marketData.meta.date_range.end}</span>
        <Link href="/assumptions" className="underline decoration-zinc-700 hover:text-zinc-300">
          Assumptions &amp; Limitations
        </Link>
      </div>
    </footer>
  );
}
