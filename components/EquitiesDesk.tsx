"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CandleSnapshot } from "@/components/CandleSnapshot";
import type { ActiveLead, HistoricalLead, MonitorLead } from "@/lib/forward-book";
import { inr } from "@/lib/format";

const HISTORY_AFTER_SELL_MS = 15 * 60 * 1000;

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

function remainingMs(markedAt: string) {
  const marked = Date.parse(markedAt);
  if (!Number.isFinite(marked)) return 0;
  return Math.max(0, marked + HISTORY_AFTER_SELL_MS - Date.now());
}

function HistoryTimer({ markedAt, onElapsed }: { markedAt: string; onElapsed: () => void }) {
  const [left, setLeft] = useState(() => remainingMs(markedAt));
  const fired = useRef(false);
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = remainingMs(markedAt);
      setLeft(next);
      if (next === 0 && !fired.current) {
        fired.current = true;
        onElapsed();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [markedAt, onElapsed]);
  const total = Math.ceil(left / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return (
    <span className="mt-1 block font-mono text-[10px] leading-tight text-[var(--sell)]">
      No longer monitored · history in {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </span>
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
  const [reloadKey, setReloadKey] = useState(0);
  const reloadHistory = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    let pending = false;

    async function load() {
      if (pending) return;
      pending = true;
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
        pending = false;
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [reloadKey]);

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
              Uptrend buys only. The daily trend must be Strong Accumulation or Very Strong Accumulation. On the
              30-minute chart the 50-bar EMA must be rising, and every earlier completed bar of the session must have
              closed above it. Entry is the high of the first pullback bar whose low tags that average and whose
              close holds above it. The buy prints when the next completed bar trades through that high, closes
              above the average, finishes in the top half of its range, and does so on at least average volume.
              A confirmed lead stays here after the cash session closes. It leaves with the monitoring row 15
              minutes after the sell price is set.
            </p>
            {leads.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted)]">No active uptrend lead.</p>
            ) : (
              <div className="mt-3 overflow-x-auto border border-[var(--line)] bg-white">
                <table className="w-full min-w-[1280px] text-left text-sm">
                  <thead className="bg-[var(--wash)] text-xs font-bold text-[var(--ink)]">
                    <tr>
                      <th className="px-3 py-2 font-bold">Candles</th>
                      <th className="px-3 py-2 font-bold">Symbol</th>
                      <th className="px-3 py-2 font-bold">Signal</th>
                      <th className="px-3 py-2 font-bold">Session</th>
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
                      <tr key={`${row.company}-${row.signalDate}`} className="border-t border-[var(--line)] align-top">
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
              Each Active Lead with an entry price is watched here, and the sell stays blank until the uptrend
              gives way. Hold while the 50-bar EMA has not been broken by a downtrend. A single dip under that
              average does not sell. The sell prints when the 50-bar EMA is falling, a completed 30-minute bar
              closes through it, and a later completed bar closes through it again with a lower high and a lower
              close, with no close back above the average in between. The sell value is that broken 50-bar EMA.
              The session close does not remove the row. Once the sell value is filled, a 15-minute timer starts
              and the lead then moves to history.
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
                          {row.sellValue != null && row.sellMarkedAt ? (
                            <HistoryTimer markedAt={row.sellMarkedAt} onElapsed={reloadHistory} />
                          ) : null}
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
              A lead lands here 15 minutes after its sell value is filled, then leaves the first two tables.
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
