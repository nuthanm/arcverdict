"use client";

import { useEffect, useState } from "react";
import { CandleSnapshot } from "@/components/CandleSnapshot";
import type { ActiveLead, HistoricalLead, MonitorLead } from "@/lib/forward-book";
import { inr } from "@/lib/format";

type BookResponse = {
  ok: boolean;
  error?: string;
  asOf?: string | null;
  universe?: number;
  closedThrough?: string;
  marketOpen?: boolean;
  freshFrom?: string;
  leads?: ActiveLead[];
  monitoring?: MonitorLead[];
  historical?: HistoricalLead[];
};

function NseSymbol({ symbol }: { symbol: string }) {
  return (
    <a
      className="font-mono underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--accent)]"
      href={`https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`}
      target="_blank"
      rel="noreferrer"
    >
      {symbol}
    </a>
  );
}

function statusClass(status: string) {
  if (status === "SELL") return "text-[var(--sell)]";
  if (status === "HOLD") return "text-[var(--hold)]";
  return "text-[var(--buy)]";
}

export function EquitiesDesk() {
  const [data, setData] = useState<BookResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/lifecycle", { cache: "no-store" });
        const text = await res.text();
        if (!text) throw new Error("Lifecycle book returned an empty response");
        let body: BookResponse;
        try {
          body = JSON.parse(text) as BookResponse;
        } catch {
          throw new Error("Lifecycle book returned an unreadable response");
        }
        if (!res.ok || !body.ok) throw new Error(body.error ?? "Lifecycle book failed");
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Lifecycle book failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const leads = data?.leads ?? [];
  const monitoring = data?.monitoring ?? [];
  const historical = data?.historical ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-[var(--muted)]">
          Book starts <strong className="font-semibold text-[var(--ink)]">{data?.freshFrom ?? "2026-09-29"}</strong>
          {data?.asOf ? (
            <>
              {" "}
              · last close <strong className="font-semibold text-[var(--ink)]">{data.asOf}</strong>
            </>
          ) : null}
          {data?.marketOpen ? (
            <>
              {" "}
              · NSE session <strong className="font-semibold text-[var(--buy)]">open</strong>, monitoring is{" "}
              <strong className="font-semibold text-[var(--buy)]">live</strong>
            </>
          ) : (
            <>
              {" "}
              · NSE session <strong className="font-semibold text-[var(--ink)]">closed</strong>
            </>
          )}
        </span>
        {loading && <span className="text-xs text-[var(--muted)]">Loading book…</span>}
      </div>

      {error && <p className="border border-red-200 bg-white px-4 py-3 text-sm text-red-700">{error}</p>}

      {data?.ok && (
        <>
          <section>
            <h2 className="text-sm font-bold text-[var(--ink)]">
              Active Leads <span className="text-[var(--muted)]">({leads.length})</span>
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
              Tomorrow’s reversal buys. Support is the hourly low where price met the 50-hour EMA and the next
              two hours stayed above it and finished higher. Entry is the first hour’s high once two consecutive
              strong hours on the lead session print a higher high above that support. Staying above support is not
              an entry. If support breaks before that pair, or the session ends without it, the lead is removed and
              is not added to monitoring or history.
            </p>
            {leads.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted)]">No active lead for the next session.</p>
            ) : (
              <div className="mt-3 overflow-x-auto border border-[var(--line)] bg-white">
                <table className="w-full min-w-[1280px] text-left text-sm">
                  <thead className="bg-[var(--wash)] text-xs font-bold text-[var(--ink)]">
                    <tr>
                      <th className="px-3 py-2 font-bold">Candles</th>
                      <th className="px-3 py-2 font-bold">Symbol</th>
                      <th className="px-3 py-2 font-bold">Signal close</th>
                      <th className="px-3 py-2 font-bold">Lead for</th>
                      <th className="px-3 py-2 font-bold text-right">Entry</th>
                      <th className="px-3 py-2 font-bold text-right">Previous close</th>
                      <th className="px-3 py-2 font-bold text-right">Current</th>
                      <th className="px-3 py-2 font-bold text-right">Support</th>
                      <th className="px-3 py-2 font-bold">Trend</th>
                      <th className="px-3 py-2 font-bold">Health</th>
                      <th className="px-3 py-2 font-bold">Pressure</th>
                      <th className="px-3 py-2 font-bold">Structure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((row) => (
                      <tr key={row.company} className="border-t border-[var(--line)] align-top">
                        <td className="px-3 py-2">
                          <CandleSnapshot
                            symbol={row.company}
                            candles={row.candles}
                            source={row.chartSource}
                            href={row.chartUrl}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <NseSymbol symbol={row.company} />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{row.signalDate}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.leadFor}</td>
                        <td className="px-3 py-2 text-right font-mono text-[var(--muted)]">
                          {row.entryPrice == null ? "—" : inr(row.entryPrice)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{inr(row.close)}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {data.marketOpen && row.currentPrice != null ? (
                            <strong
                              className={`font-semibold ${
                                row.close != null && row.currentPrice < row.close
                                  ? "text-[var(--sell)]"
                                  : "text-[var(--buy)]"
                              }`}
                            >
                              {row.currentPrice.toLocaleString("en-IN", {
                                style: "currency",
                                currency: "INR",
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </strong>
                          ) : (
                            inr(row.currentPrice)
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{inr(row.supportPrice)}</td>
                        <td className="px-3 py-2 text-[var(--buy)]">{row.trend ?? "—"}</td>
                        <td className="px-3 py-2">{row.healthState ?? "—"}</td>
                        <td className="px-3 py-2">{row.pressure ?? "—"}</td>
                        <td className="px-3 py-2">{row.structureState ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-bold text-[var(--ink)]">
              Trend reversal downward Monitoring for Active Leads{" "}
              <span className="text-[var(--muted)]">({monitoring.length})</span>
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
              A lead appears here only after two strong lead-session hours print a higher high and that entry is on
              Active Leads. Resistance is the hourly high
              where price met the 50-hour EMA after the rally, and only after the next two hours closed below that
              average and finished lower. Hold until that rejection confirms. Sell once it does. The sell price stays
              empty until the reversal sell prints, then the row stays here until that session closes.
            </p>
            {monitoring.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted)]">
                No monitored lead yet. A row appears here only after the entry price is filled on Active Leads.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto border border-[var(--line)] bg-white">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="bg-[var(--wash)] text-xs font-bold text-[var(--ink)]">
                    <tr>
                      <th className="px-3 py-2 font-bold">Status</th>
                      <th className="px-3 py-2 font-bold">Symbol</th>
                      <th className="px-3 py-2 font-bold">Signal</th>
                      <th className="px-3 py-2 font-bold">Session</th>
                      <th className="px-3 py-2 font-bold text-right">Entry</th>
                      <th className="px-3 py-2 font-bold text-right">Last</th>
                      <th className="px-3 py-2 font-bold text-right">Resistance</th>
                      <th className="px-3 py-2 font-bold">Trend</th>
                      <th className="px-3 py-2 font-bold text-right">Sell</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitoring.map((row) => (
                      <tr key={`${row.company}-${row.signalDate}`} className="border-t border-[var(--line)]">
                        <td className={`px-3 py-2 ${statusClass(row.status)}`}>{row.statusNote}</td>
                        <td className="px-3 py-2">
                          <NseSymbol symbol={row.company} />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{row.signalDate}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.leadFor}</td>
                        <td className="px-3 py-2 text-right font-mono">{inr(row.entryPrice)}</td>
                        <td className="px-3 py-2 text-right font-mono">{inr(row.lastPrice)}</td>
                        <td className="px-3 py-2 text-right font-mono">{inr(row.resistancePrice)}</td>
                        <td className="px-3 py-2">{row.trend ?? "—"}</td>
                        <td
                          className={`px-3 py-2 text-right font-mono ${row.sellValue == null ? "text-[var(--muted)]" : "text-[var(--sell)]"}`}
                        >
                          {row.sellValue == null ? "—" : inr(row.sellValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-bold text-[var(--ink)]">
              Historical Leads provided <span className="text-[var(--muted)]">({historical.length})</span>
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
              A lead lands here at the close of the day its reversal sell formed, then leaves the first two tables.
              Signal and entry come from Active Leads. The sell price comes from the monitoring table.
            </p>
            <div className="mt-3 overflow-x-auto border border-[var(--line)] bg-white">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-[var(--wash)] text-xs font-bold text-[var(--ink)]">
                  <tr>
                    <th className="px-3 py-2 font-bold">Symbol</th>
                    <th className="px-3 py-2 font-bold">Signal</th>
                    <th className="px-3 py-2 font-bold text-right">Entry</th>
                    <th className="px-3 py-2 font-bold text-right">Sell</th>
                  </tr>
                </thead>
                <tbody>
                  {historical.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-sm text-[var(--muted)]" colSpan={4}>
                        No completed reversal sell since the fresh start.
                      </td>
                    </tr>
                  ) : (
                    historical.map((row) => (
                      <tr key={`${row.company}-${row.signalDate}`} className="border-t border-[var(--line)]">
                        <td className="px-3 py-2">
                          <NseSymbol symbol={row.company} />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{row.signalDate}</td>
                        <td className="px-3 py-2 text-right font-mono">{inr(row.entryPrice)}</td>
                        <td className="px-3 py-2 text-right font-mono text-[var(--sell)]">{inr(row.sellValue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
