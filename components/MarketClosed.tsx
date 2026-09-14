"use client";

import { HintLabel } from "@/components/InfoTip";
import type { SessionInfo } from "@/lib/types";

export function MarketClosed({ session }: { session: SessionInfo }) {
  return (
    <section className="border border-[var(--line)] bg-white px-5 py-8">
      <HintLabel tipKey="session" className="font-mono text-[11px] tracking-[0.16em] text-[var(--accent)]">
        SESSION
      </HintLabel>
      <h2 className="mt-2 text-xl text-[var(--ink)]">{session.label}</h2>
      <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">{session.hours}</p>
      <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
        Prices are not requested while this session is shut.
      </p>
      {session.nextOpen && (
        <p className="mt-3 font-mono text-sm text-[var(--ink)]">Next open {session.nextOpen}</p>
      )}
    </section>
  );
}
