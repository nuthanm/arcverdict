"use client";

import { useMemo, useState } from "react";
import { ActionBadge } from "@/components/ActionBadge";
import { DeskStatus } from "@/components/DeskStatus";
import { FillNowCell } from "@/components/FillNowCell";
import { HintCorner, HintLabel } from "@/components/InfoTip";
import { ConvictionChangeTiles, HintStat, HintTh } from "@/components/HintStat";
import { InstructionPanel } from "@/components/InstructionPanel";
import { MarketClosed } from "@/components/MarketClosed";
import { DESK_UNIVERSE_NOTE, NIFTY_UNIVERSE_NOTE, NSE_LISTED_SNAPSHOT } from "@/lib/copy";
import {
  actionBorder,
  actionClass,
  actionStance,
  actionWash,
  changeClass,
  convictionClass,
  convictionPct,
  equityQuoteNote,
  inr,
  meanConviction,
  pct,
  showEnterFill,
  showExitFill,
  showStopLevel,
  signedInr,
  stanceBar,
  stanceLabel,
} from "@/lib/format";
import { pricesAsOf } from "@/lib/session";
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

const ACTIONS: Action[] = ["BUY", "SELL", "HOLD", "WATCH", "NONE"];

export function EquitiesDesk() {
  const { settings, ready } = useDeskSettings();
  const { session, data, loading, error, loadBook, showRun, fetchedAt, intervalSec } = useLiveDesk<ScanResponse>({
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

  const bucketConviction = useMemo(() => {
    const acc = { BUY: [], SELL: [], HOLD: [], WATCH: [], NONE: [] } as Record<Action, number[]>;
    for (const row of rows) acc[row.action].push(row.conviction);
    return {
      BUY: meanConviction(acc.BUY),
      SELL: meanConviction(acc.SELL),
      HOLD: meanConviction(acc.HOLD),
      WATCH: meanConviction(acc.WATCH),
      NONE: meanConviction(acc.NONE),
    };
  }, [rows]);

  const picked = rows.find((r) => r.ticker === selected) ?? null;

  const transactN = (data?.counts?.BUY ?? 0) + (data?.counts?.SELL ?? 0);

  return (
    <div className="space-y-4">
      <DeskStatus
        session={session}
        fallbackLabel="NSE India equity session"
        runAt={data?.runAt}
        loading={loading}
        showRun={showRun}
        onRefresh={loadBook}
        intervalSec={intervalSec}
        fetchedAt={fetchedAt}
      />

      {error && <p className="border border-red-200 bg-white px-4 py-3 text-sm text-red-700">{error}</p>}

      {session && !session.open && <MarketClosed session={session} />}
      {!data && loading && (
        <p className="border border-[var(--line)] bg-white px-4 py-6 text-sm text-[var(--muted)]">
          Loading NSE book…
        </p>
      )}

      <div>
        <h1 className="text-2xl tracking-tight text-[var(--ink)]">Nifty 500</h1>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{NIFTY_UNIVERSE_NOTE}</p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{DESK_UNIVERSE_NOTE}</p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{NSE_LISTED_SNAPSHOT}</p>
        {data?.ok ? (
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {data.quoted ?? 0}/{data.universe ?? 0} quoted · {transactN} enter/exit
            {data.marketClosed ? " · close snapshot" : ""}
          </p>
        ) : null}
      </div>

      {data?.ok && data.counts && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {ACTIONS.map((key, index) => (
              <div
                key={key}
                className={`relative border border-[var(--line)] border-l-4 px-3 py-2.5 pr-7 ${actionBorder(key)} ${actionWash(key)}`}
              >
                <HintCorner tipKey={key} align={index >= 3 ? "end" : "start"} />
                <p className={`font-mono text-xl leading-tight ${actionClass(key)}`}>{data.counts?.[key] ?? 0}</p>
                <p className={`mt-1 text-[11px] ${actionClass(key)}`}>{key}</p>
                <p className={`mt-1 font-mono text-[11px] ${convictionClass(bucketConviction[key])}`}>
                  Conv. {convictionPct(bucketConviction[key])}
                </p>
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

      {picked && data?.ok && (
        <article className="relative overflow-hidden border border-[var(--line)] bg-white">
          <div className={`h-1.5 ${stanceBar(actionStance(picked.action))}`} />
          <HintCorner tipKey="ltp" />
          <div className="px-4 pb-4 pt-6 pr-10 sm:px-5 sm:pr-11">
            <p className="font-mono text-[11px] text-[var(--muted)]">
              {picked.ticker} · {picked.kind === "etf" ? "ETF" : "Equity"}
            </p>
            <div className="mt-1 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-2xl tracking-tight text-[var(--ink)]">{picked.name}</h2>
                  <p className={`text-sm ${actionClass(picked.action)}`}>{stanceLabel(picked.action)}</p>
                </div>
              </div>
              <div className="shrink-0 pr-4 text-right">
                <p className={`font-mono text-3xl leading-none ${changeClass(picked.changePct)}`}>{inr(picked.last)}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">LTP · NSE last</p>
              </div>
            </div>

            {picked.last != null ? <NseQuoteBoard row={picked} /> : null}

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {showEnterFill(picked.action) && (
                <HintStat
                  value={inr(picked.buyAt)}
                  label="Enter at"
                  tipKey="enterAt"
                  className={actionClass("BUY")}
                  wash="bg-[var(--buy-wash)]"
                />
              )}
              {showExitFill(picked.action) && (
                <HintStat
                  value={inr(picked.sellAt)}
                  label="Exit at"
                  tipKey="exitAt"
                  className={actionClass("SELL")}
                  wash="bg-[var(--sell-wash)]"
                />
              )}
              {showStopLevel(picked.action) && (
                <HintStat value={inr(picked.stop)} label="Protective stop" tipKey="stop" wash="bg-[var(--wash)]" />
              )}
              <ConvictionChangeTiles conviction={picked.conviction} changePct={picked.changePct} />
            </div>
            <InstructionPanel
              className="mt-4"
              action={picked.action}
              why={picked.why}
              footer={equityQuoteNote(picked.priceSource)}
            />
          </div>
        </article>
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
      <h2 className="mb-1.5 text-sm text-[var(--ink)]">
        {title} <span className="text-[var(--muted)]">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--muted)]">
          None in this snapshot.
        </p>
      ) : (
        <div className="overflow-x-auto border border-[var(--line)] bg-white">
          <table className="w-full min-w-[1020px] text-left text-sm">
            <thead className="bg-[var(--wash)] text-[11px] tracking-wide text-[var(--muted)]">
              <tr>
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Action</th>
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Ticker</th>
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Name</th>
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Type</th>
                <HintTh tipKey="ltp" className="text-right">
                  LTP
                </HintTh>
                <HintTh tipKey="payReceive" className="text-right">
                  Pay / Receive now
                </HintTh>
                <HintTh tipKey="conviction" className="text-right">
                  Conviction
                </HintTh>
                <HintTh tipKey="change" className="text-right">
                  Change
                </HintTh>
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Instruction</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.ticker}
                  className={`cursor-pointer border-t border-[var(--line)] ${
                    selected === r.ticker ? actionWash(r.action) : "hover:bg-[var(--wash)]"
                  }`}
                  onClick={() => onSelect(r.ticker)}
                >
                  <td className="px-3 py-1.5">
                    <ActionBadge action={r.action} />
                  </td>
                  <td className="px-3 py-1.5 font-mono">{r.ticker}</td>
                  <td className="px-3 py-1.5">{r.name}</td>
                  <td className="px-3 py-1.5 text-[var(--muted)]">{r.kind === "etf" ? "ETF" : "Equity"}</td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {inr(r.last)}
                    {r.asOf ? (
                      <span className="mt-0.5 block text-[11px] font-sans text-[var(--muted)]">
                        {pricesAsOf(r.asOf)}
                      </span>
                    ) : null}
                  </td>
                  <FillNowCell
                    action={r.action}
                    buyLabel={r.last == null ? null : inr(r.buyAt)}
                    sellLabel={r.last == null ? null : inr(r.sellAt)}
                  />
                  <td className={`px-3 py-1.5 text-right font-mono ${convictionClass(r.conviction)}`}>
                    {convictionPct(r.conviction)}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono ${changeClass(r.changePct)}`}>
                    {pct(r.changePct)}
                  </td>
                  <td className="max-w-[280px] px-3 py-1.5 text-[var(--muted)]">{r.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function NseQuoteBoard({ row }: { row: ScanRow }) {
  return (
    <div className="mt-4 overflow-x-auto border border-[var(--line)] bg-[var(--wash)]">
      <table className="w-full min-w-[22rem] text-left text-xs">
        <caption className="sr-only">NSE last, change, close, high, low, and last trade time</caption>
        <thead className="text-[11px] tracking-wide text-[var(--muted)]">
          <tr>
            <th className="whitespace-nowrap px-3 py-1.5 font-medium">Quote</th>
            <th className="whitespace-nowrap px-3 py-1.5 text-right font-medium">NSE</th>
          </tr>
        </thead>
        <tbody className="bg-white text-[var(--ink)]">
          <tr className="border-t border-[var(--line)]">
            <th className="px-3 py-1.5 font-medium text-[var(--muted)]">Last</th>
            <td className={`px-3 py-1.5 text-right font-mono ${changeClass(row.changePct)}`}>{inr(row.last)}</td>
          </tr>
          <tr className="border-t border-[var(--line)]">
            <th className="px-3 py-1.5 font-medium text-[var(--muted)]">Change</th>
            <td className={`px-3 py-1.5 text-right font-mono ${changeClass(row.changePct)}`}>
              {signedInr(row.changeInr)} {pct(row.changePct)}
            </td>
          </tr>
          <tr className="border-t border-[var(--line)]">
            <th className="px-3 py-1.5 font-medium text-[var(--muted)]">
              <HintLabel tipKey="nseClose">Close</HintLabel>
            </th>
            <td className="px-3 py-1.5 text-right font-mono">{inr(row.prevClose)}</td>
          </tr>
          <tr className="border-t border-[var(--line)]">
            <th className="px-3 py-1.5 font-medium text-[var(--muted)]">High</th>
            <td className="px-3 py-1.5 text-right font-mono">{inr(row.dayHigh)}</td>
          </tr>
          <tr className="border-t border-[var(--line)]">
            <th className="px-3 py-1.5 font-medium text-[var(--muted)]">Low</th>
            <td className="px-3 py-1.5 text-right font-mono">{inr(row.dayLow)}</td>
          </tr>
          <tr className="border-t border-[var(--line)]">
            <th className="px-3 py-1.5 font-medium text-[var(--muted)]">Last trade</th>
            <td className="px-3 py-1.5 text-right font-mono">{row.asOf ?? "—"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
