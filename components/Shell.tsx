"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEGAL_MARKET_NOTE, REFERENCE_FOOTER } from "@/lib/copy";

const NAV = [
  { href: "/", label: "Nifty 500" },
  { href: "/gold", label: "Gold" },
  { href: "/silver", label: "Silver" },
  { href: "/copper", label: "Copper" },
  { href: "/settings", label: "Settings" },
];

function LegendTerm({ children }: { children: string }) {
  return <strong className="font-semibold text-[var(--accent)]">{children}</strong>;
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="2" fill="none" stroke="#1b7a4e" strokeWidth="1.4" />
      <path d="M8 20 L13 12 L18 17 L24 8" fill="none" stroke="#1b7a4e" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col px-5 py-6">
      <header className="mb-4 flex flex-wrap items-center gap-3 border-b border-[var(--line)] pb-3">
        <Link
          href="/"
          aria-label="ArcVerdict home"
          className="flex items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
        >
          <Logo />
          <span>
            <span className="block font-mono text-[11px] tracking-[0.18em] text-[var(--accent)]">ARCV</span>
            <span className="block text-sm text-[var(--ink)]">ArcVerdict</span>
          </span>
        </Link>
        <nav className="ml-auto flex flex-wrap gap-1">
          {NAV.map((item) => {
            const active = path === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 text-sm ${
                  active ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-8 border-t border-[var(--line)] pt-4 text-xs leading-relaxed text-[var(--muted)]">
        <p className="text-sm text-[var(--ink)]">{REFERENCE_FOOTER}</p>
        <p className="mt-3">
          <LegendTerm>BUY</LegendTerm> means enter. <LegendTerm>SELL</LegendTerm> means exit / come out.{" "}
          <LegendTerm>HOLD</LegendTerm> means stay in the position. <LegendTerm>WATCH</LegendTerm> means wait — no
          enter or exit now. <LegendTerm>NONE</LegendTerm> means no instruction.
        </p>
        <p className="mt-3 max-w-3xl">
          Educational purpose only. This is a research and education overlay, not investment advice, not a
          solicitation, and not a SEBI-registered investment adviser or research analyst product. Do not treat
          anything on this site as a recommendation to buy or sell. Markets can lose money. {LEGAL_MARKET_NOTE}
        </p>
        <p className="mt-3">© 2026 ArcVerdict. All rights reserved.</p>
      </footer>
    </div>
  );
}
