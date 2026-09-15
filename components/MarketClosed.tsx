"use client";

import { HintLabel } from "@/components/InfoTip";
import { SESSION_CLOSED_SNAPSHOT } from "@/lib/copy";
import type { SessionInfo } from "@/lib/types";

export function MarketClosed({ session }: { session: SessionInfo }) {
  return (
    <section className="border border-[var(--line)] bg-white px-4 py-3">
      <HintLabel tipKey="session" className="font-mono text-[11px] tracking-[0.16em] text-[var(--accent)]">
        SESSION
      </HintLabel>
      <p className="mt-1 text-sm text-[var(--ink)]">{SESSION_CLOSED_SNAPSHOT}</p>
      {session.nextOpen && (
        <p className="mt-1 font-mono text-sm text-[var(--ink)]">Next open {session.nextOpen}</p>
      )}
    </section>
  );
}
