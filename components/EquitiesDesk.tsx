"use client";

import { useMemo, useState } from "react";
import { ActionBadge } from "@/components/ActionBadge";
import { MarketClosed } from "@/components/MarketClosed";
import { actionClass, actionTitle, inr, pct } from "@/lib/format";
import type { Action, ScanRow } from "@/lib/types";
import { useDeskSettings } from "@/lib/useDeskSettings";
import { useLiveDesk } from "@/lib/useLiveDesk";

type ScanResponse = {
  ok: boolean;
  error?: string;
  marketClosed?: boolean;
  runAt?: string;
  session?: { label: string; hours: string; open: boolean };
  universe?: number;
  quoted?: number;
  counts?: Record<Action, number>;
  rows?: ScanRow[];
};

type View = "transact" | "manage" | "all";

export function EquitiesDesk() {
  const { settings, ready } = useDeskSettings();
  const { session, data, loading, error, loadBook, showRun } = useLiveDesk<ScanResponse>({
    market: "nse",
    path: "/api/scan",
    settings,
    ready,
  });
  const [view, setView] = useState<View>("transact");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const rows = data?.rows ?? [];
  const filtered = rows.filter((r) => {
    const q = query.trim().toUpperCase();
    return !q || r.ticker.includes(q) || r.name.toUpperCase().includes(q);
  });

  const groups = useMemo(() => {
    return {
      buy: filtered.filter((r) => r.action === "BUY"),
      sell: filtered.filter((r) => r.action === "SELL"),
      hold: filtered.filter((r) => r.action === "HOLD"),
      watch: filtered.filter((r) => r.action === "WATCH"),
      none: filtered.filter((r) => r.action === "NONE"),
    };
  }, [filtered]);

  const picked = rows.find((r) => r.ticker === selected) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-[var(--muted)]">
          {session?.label ?? "NSE"} · {session?.hours}
        </span>
        {data?.runAt && session?.open && (
          <span className="font-mono text-xs text-[var(--muted)]">Last snapshot {data.runAt}</span>
        )}
        {loading && <span className="text-xs text-[var(--muted)]">Updating…</span>}
        {showRun && (
          <button
            type="button"
            onClick={loadBook}
            disabled={loading}
            className="ml-auto bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Refresh snapshot
          </button>
        )}
      </div>

      {error && <p className="border border-red-200 bg-white px-4 py-3 text-sm text-red-700">{error}</p>}

      {session && !session.open && <MarketClosed session={session} />}

      {session?.open && data?.ok && data.counts && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(["BUY", "SELL", "HOLD", "WATCH", "NONE"] as Action[]).map((key) => (
              <div key={key} className="border border-[var(--line)] bg-white px-3 py-3">
                <p className={`font-mono text-xl ${actionClass(key)}`}>{data.counts?.[key] ?? 0}</p>
                <p className="text-xs text-[var(--muted)]">{key}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Toggle label="Enter or exit" active={view === "transact"} onClick={() => setView("transact")} />
            <Toggle label="Hold / watch" active={view === "manage"} onClick={() => setView("manage")} />
            <Toggle label="Full book" active={view === "all"} onClick={() => setView("all")} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticker"
              className="min-w-[180px] flex-1 border border-[var(--line)] bg-white px-3 py-1.5 text-sm outline-none"
            />
          </div>

          {(view === "transact" || view === "all") && (
            <BookTable title="Enter" rows={groups.buy} selected={selected} onSelect={setSelected} />
          )}
          {(view === "transact" || view === "all") && (
            <BookTable title="Exit" rows={groups.sell} selected={selected} onSelect={setSelected} />
          )}
          {(view === "manage" || view === "all") && (
            <BookTable
              title="Hold / watch"
              rows={[...groups.hold, ...groups.watch]}
              selected={selected}
              onSelect={setSelected}
            />
          )}
          {view === "all" && (
            <BookTable title="No instruction" rows={groups.none} selected={selected} onSelect={setSelected} />
          )}
        </>
      )}

      {picked && session?.open && (
        <section className="border border-[var(--line)] bg-white p-4">
          <p className="font-mono text-xs text-[var(--muted)]">
            {picked.ticker} · {picked.kind === "etf" ? "ETF" : "Equity"}
          </p>
          <h2 className="mt-1 text-lg text-[var(--ink)]">{picked.name}</h2>
          <p className={`mt-3 text-sm ${actionClass(picked.action)}`}>{actionTitle(picked.action)}</p>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{picked.why}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-[var(--muted)]">Buy at</dt>
              <dd className="font-mono">{inr(picked.buyAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Sell at</dt>
              <dd className="font-mono">{inr(picked.sellAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Protective stop</dt>
              <dd className="font-mono">{inr(picked.stop)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Price basis</dt>
              <dd className="text-xs">{picked.priceSource === "bid_ask" ? "Quoted bid / ask" : "Last print ± spread"}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`px-3 py-1.5 text-sm ${active ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function BookTable({
  title,
  rows,
  selected,
  onSelect,
}: {
  title: string;
  rows: ScanRow[];
  selected: string | null;
  onSelect: (ticker: string) => void;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm text-[var(--ink)]">
        {title} <span className="text-[var(--muted)]">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">None in this snapshot.</p>
      ) : (
        <div className="overflow-x-auto border border-[var(--line)] bg-white">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-[var(--wash)] text-xs text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Ticker</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium text-right">Buy at</th>
                <th className="px-3 py-2 font-medium text-right">Sell at</th>
                <th className="px-3 py-2 font-medium text-right">Change</th>
                <th className="px-3 py-2 font-medium">Instruction</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.ticker}
                  className={`cursor-pointer border-t border-[var(--line)] ${selected === r.ticker ? "bg-[var(--wash)]" : "hover:bg-[var(--wash)]"}`}
                  onClick={() => onSelect(r.ticker)}
                >
                  <td className="px-3 py-2">
                    <ActionBadge action={r.action} />
                  </td>
                  <td className="px-3 py-2 font-mono">{r.ticker}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">{r.kind === "etf" ? "ETF" : "Equity"}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.buyAt)}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.sellAt)}</td>
                  <td className="px-3 py-2 text-right font-mono">{pct(r.changePct)}</td>
                  <td className="max-w-[280px] px-3 py-2 text-[var(--muted)]">{r.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
