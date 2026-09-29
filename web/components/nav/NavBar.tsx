"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS } from "./nav-links";

export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <Link
          href="/"
          className="shrink-0 font-mono text-sm font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
        >
          QUANT<span className="text-emerald-400">/</span>RISK
        </Link>
        {/* The four links plus the wordmark are ~29px wider than a 375px
            viewport, which used to make the whole PAGE scroll sideways --
            and a page that scrolls horizontally defeats the tables below,
            which are built to scroll inside their own container instead.
            min-w-0 lets this flex child shrink below its content width so
            overflow-x-auto actually engages on the nav alone. */}
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {NAV_LINKS.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-background text-foreground"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
