import type { SessionInfo } from "@/lib/types";

export function MarketClosed({ session }: { session: SessionInfo }) {
  return (
    <section className="border border-[var(--line)] bg-white px-5 py-10">
      <p className="font-mono text-xs tracking-[0.16em] text-[var(--accent)]">SESSION</p>
      <h2 className="mt-2 text-xl text-[var(--ink)]">{session.label}</h2>
      <p className="mt-3 max-w-xl text-sm text-[var(--muted)]">
        {session.hours}. Market data is not requested while the session is shut.
      </p>
      {session.nextOpen && (
        <p className="mt-4 font-mono text-sm text-[var(--ink)]">Next open {session.nextOpen}</p>
      )}
    </section>
  );
}
