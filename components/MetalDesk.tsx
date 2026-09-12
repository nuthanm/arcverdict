"use client";

import { MarketClosed } from "@/components/MarketClosed";
import { actionClass, actionTitle, inr, pct } from "@/lib/format";
import type { MetalCode, MetalQuote } from "@/lib/types";
import { useDeskSettings } from "@/lib/useDeskSettings";
import { useLiveDesk } from "@/lib/useLiveDesk";

type MetalsResponse = {
  ok: boolean;
  error?: string;
  marketClosed?: boolean;
  runAt?: string;
  usdInr?: number | null;
  session?: { label: string; hours: string };
  metals?: MetalQuote[];
};

export function MetalDesk({ code }: { code: MetalCode }) {
  const { settings, ready } = useDeskSettings();
  const { session, data, loading, error, loadBook, showRun } = useLiveDesk<MetalsResponse>({
    market: "metals",
    path: "/api/metals",
    settings,
    ready,
  });

  const metal = data?.metals?.find((m) => m.code === code);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-[var(--muted)]">
          {session?.label ?? "Metals"} · {session?.hours}
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

      {metal && session?.open && (
        <>
          <h1 className="text-2xl tracking-tight text-[var(--ink)]">{metal.name}</h1>
          <p className="text-sm text-[var(--muted)]">{metal.venue}</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={inr(metal.buyAt)} label={`Buy at · ${metal.unit}`} />
            <Stat value={inr(metal.sellAt)} label={`Sell at · ${metal.unit}`} />
            <Stat value={metal.action} label="Action" className={actionClass(metal.action)} />
            <Stat value={inr(metal.stop)} label="Protective stop" />
          </div>

          <section className="border border-[var(--line)] bg-white p-4">
            <p className={`text-sm ${actionClass(metal.action)}`}>{actionTitle(metal.action)}</p>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{metal.why}</p>
            <p className="mt-4 font-mono text-xs text-[var(--muted)]">
              {metal.yahoo}
              {metal.lastUsd != null ? ` · ${metal.lastUsd.toFixed(2)} USD` : ""}
              {data?.usdInr != null ? ` · USD/INR ${data.usdInr.toFixed(2)}` : ""}
              {metal.priceSource === "bid_ask" ? " · quoted bid/ask" : " · last print ± spread"}
            </p>
          </section>

          <h2 className="text-sm text-[var(--ink)]">Listed ETFs — executable levels</h2>
          {metal.etfs.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No liquid India-listed copper ETF in the current universe. Use the metal levels above.
            </p>
          ) : (
            <div className="overflow-x-auto border border-[var(--line)] bg-white">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-[var(--wash)] text-xs text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">ETF</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium text-right">Buy at</th>
                    <th className="px-3 py-2 font-medium text-right">Sell at</th>
                    <th className="px-3 py-2 font-medium text-right">Change</th>
                    <th className="px-3 py-2 font-medium">Instruction</th>
                  </tr>
                </thead>
                <tbody>
                  {metal.etfs.map((etf) => (
                    <tr key={etf.ticker} className="border-t border-[var(--line)]">
                      <td className="px-3 py-2">
                        <span className="font-mono">{etf.ticker}</span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">{etf.name}</span>
                      </td>
                      <td className={`px-3 py-2 font-mono text-xs ${actionClass(etf.action)}`}>{etf.action}</td>
                      <td className="px-3 py-2 text-right font-mono">{inr(etf.buyAt)}</td>
                      <td className="px-3 py-2 text-right font-mono">{inr(etf.sellAt)}</td>
                      <td className="px-3 py-2 text-right font-mono">{pct(etf.changePct)}</td>
                      <td className="px-3 py-2 text-[var(--muted)]">{etf.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ value, label, className }: { value: string; label: string; className?: string }) {
  return (
    <div className="border border-[var(--line)] bg-white px-3 py-3">
      <p className={`font-mono text-xl ${className ?? ""}`}>{value}</p>
      <p className="text-xs text-[var(--muted)]">{label}</p>
    </div>
  );
}
