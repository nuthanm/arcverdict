"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Nifty 500" },
  { href: "/gold", label: "Gold" },
  { href: "/silver", label: "Silver" },
  { href: "/copper", label: "Copper" },
  { href: "/settings", label: "Settings" },
];

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
      <header className="mb-6 flex flex-wrap items-center gap-3 border-b border-[var(--line)] pb-4">
        <Logo />
        <div>
          <p className="font-mono text-[11px] tracking-[0.18em] text-[var(--accent)]">ARCV</p>
          <p className="text-sm text-[var(--ink)]">ArcVerdict</p>
        </div>
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
      <footer className="mt-10 border-t border-[var(--line)] pt-4 text-xs text-[var(--muted)]">
        BUY enter · SELL exit · HOLD maintain · WATCH wait · NONE no instruction. Research overlay, not a solicitation.
      </footer>
    </div>
  );
}
