"use client";

import { ActionBadge } from "@/components/ActionBadge";
import { DeskStatus } from "@/components/DeskStatus";
import { FillNowCell } from "@/components/FillNowCell";
import { HintCorner, HintLabel } from "@/components/InfoTip";
import { ConvictionChangeTiles, HintStat, HintTh } from "@/components/HintStat";
import { InstructionPanel } from "@/components/InstructionPanel";
import { MarketClosed } from "@/components/MarketClosed";
import {
  COMEX_LAST_MISSING,
  COPPER_ETF_EMPTY,
  DESK_UNIVERSE_NOTE,
  GOLD_ETF_NOT_IN_FEED,
  LTP_REFERENCE_NOTE,
} from "@/lib/copy";
import {
  actionClass,
  actionStance,
  changeClass,
  convictionClass,
  convictionPct,
  inr,
  inrUnit,
  metalEtfHeading,
  metalQuoteNote,
  metalUsdDigits,
  money,
  pct,
  showEnterFill,
  showExitFill,
  showStopLevel,
  signedUsd,
  stanceBar,
  stanceLabel,
  unitCaption,
  usd,
} from "@/lib/format";
import { metalSessionLabel, pricesAsOf } from "@/lib/session";
import type { FxSource, MetalCode, MetalQuote, QuoteCurrency } from "@/lib/types";
import { useDeskSettings } from "@/lib/useDeskSettings";
import { useLiveDesk } from "@/lib/useLiveDesk";

type MetalsResponse = {
  ok: boolean;
  error?: string;
  marketClosed?: boolean;
  runAt?: string;
  usdInr?: number | null;
  usdInrSource?: FxSource | null;
  session?: { label: string; hours: string };
  metals?: MetalQuote[];
};

export function MetalDesk({ code }: { code: MetalCode }) {
  const { settings, ready } = useDeskSettings();
  const { session, data, loading, error, loadBook, showRun, fetchedAt, intervalSec } = useLiveDesk<MetalsResponse>({
    market: "metals",
    path: "/api/metals",
    settings,
    ready,
  });

  const metal = data?.metals?.find((m) => m.code === code);
  const ccy: QuoteCurrency = metal?.quoteCurrency ?? "INR";
  const last = ccy === "INR" ? (metal?.lastInr ?? null) : (metal?.lastUsd ?? null);
  const hasLast = last != null;
  const stance = metal ? actionStance(metal.action) : "neutral";
  const statusSession = session
    ? { ...session, label: metalSessionLabel(code, session.open) }
    : session;
  const listedEtfs = metal?.etfs ?? [];

  return (
    <div className="space-y-4">
      <DeskStatus
        session={statusSession}
        fallbackLabel="US metals futures session"
        runAt={data?.runAt}
        loading={loading}
        showRun={showRun}
        onRefresh={loadBook}
        intervalSec={intervalSec}
        fetchedAt={fetchedAt}
      />

      {error && <p className="border border-red-200 bg-white px-4 py-3 text-sm text-red-700">{error}</p>}
      {statusSession && !statusSession.open && <MarketClosed session={statusSession} />}
      {!metal && loading && (
        <p className="border border-[var(--line)] bg-white px-4 py-6 text-sm text-[var(--muted)]">
          Loading COMEX book…
        </p>
      )}

      {metal && (
        <>
          {hasLast ? (
            <article className="relative overflow-hidden border border-[var(--line)] bg-white">
              <div className={`h-1.5 ${stanceBar(stance)}`} />
              <HintCorner tipKey="ltp" />
              <div className="px-4 pb-4 pt-6 pr-10 sm:px-5 sm:pr-11">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h1 className="text-2xl tracking-tight text-[var(--ink)]">{metal.name}</h1>
                      <p className={`text-sm ${actionClass(metal.action)}`}>{stanceLabel(metal.action)}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">{metal.venue}</p>
                  </div>
                  <div className="shrink-0 pr-4 text-right">
                    <p className={`font-mono text-3xl leading-none ${changeClass(metal.changePct)}`}>
                      {money(last, ccy)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">LTP · {unitCaption(metal.unit)}</p>
                    <p className="mt-1 font-mono text-sm text-[var(--ink)]">
                      <span className="font-semibold">COMEX {usd(metal.lastUsd, metalUsdDigits(metal.code))}</span>
                      <span className="text-[var(--muted)]"> · </span>
                      <span className="font-semibold">
                        {inr(metal.lastInr)} / {inrUnit(metal.unit)}
                      </span>
                    </p>
                  </div>
                </div>

                <MetalQuoteBoard metal={metal} />

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {showEnterFill(metal.action) && (
                    <HintStat
                      value={money(metal.buyAt, ccy)}
                      label="Enter at"
                      tipKey="enterAt"
                      className={actionClass("BUY")}
                      wash="bg-[var(--buy-wash)]"
                    />
                  )}
                  {showExitFill(metal.action) && (
                    <HintStat
                      value={money(metal.sellAt, ccy)}
                      label="Exit at"
                      tipKey="exitAt"
                      className={actionClass("SELL")}
                      wash="bg-[var(--sell-wash)]"
                    />
                  )}
                  {showStopLevel(metal.action) && (
                    <HintStat
                      value={money(metal.stop, ccy)}
                      label="Protective stop"
                      tipKey="stop"
                      wash="bg-[var(--wash)]"
                    />
                  )}
                  <ConvictionChangeTiles conviction={metal.conviction} changePct={metal.changePct} />
                </div>

                <InstructionPanel
                  className="mt-4"
                  action={metal.action}
                  why={metal.why}
                  footer={metalFooter(metal, data)}
                />
              </div>
            </article>
          ) : (
            <article className="border border-[var(--line)] bg-white px-4 py-5 sm:px-5">
              <h1 className="text-2xl tracking-tight text-[var(--ink)]">{metal.name}</h1>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{metal.venue}</p>
              <p className="mt-3 max-w-2xl text-sm text-[var(--ink)]">
                {COMEX_LAST_MISSING} No last print for this contract.
              </p>
              <InstructionPanel className="mt-4" action={metal.action} why={metal.why} footer={metalFooter(metal, data)} />
            </article>
          )}

          <section>
            <h2 className="mb-2 text-sm text-[var(--ink)]">{metalEtfHeading(code)}</h2>
            {listedEtfs.length === 0 ? (
              <>
                <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted)]">{COPPER_ETF_EMPTY}</p>
                <p className="mt-2 max-w-2xl text-xs text-[var(--muted)]">{DESK_UNIVERSE_NOTE}</p>
              </>
            ) : (
              <>
                <div className="overflow-x-auto border border-[var(--line)] bg-white">
                  <table className="w-full min-w-[960px] text-left text-sm">
                    <thead className="bg-[var(--wash)] text-[11px] tracking-wide text-[var(--muted)]">
                      <tr>
                        <th className="whitespace-nowrap px-3 py-2 font-medium">ETF</th>
                        <th className="whitespace-nowrap px-3 py-2 font-medium">Action</th>
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
                        <th className="whitespace-nowrap px-3 py-2 font-medium">Instruction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listedEtfs.map((etf) => (
                        <tr key={etf.ticker} className="border-t border-[var(--line)] hover:bg-[var(--wash)]">
                          <td className="px-3 py-1.5">
                            <span className="font-mono">{etf.ticker}</span>
                            <span className="mt-0.5 block text-[11px] text-[var(--muted)]">{etf.name}</span>
                          </td>
                          <td className="px-3 py-1.5">
                            <ActionBadge action={etf.action} />
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {money(etf.last, "INR")}
                            {etf.asOf ? (
                              <span className="mt-0.5 block text-[11px] font-sans text-[var(--muted)]">
                                {pricesAsOf(etf.asOf)}
                              </span>
                            ) : null}
                          </td>
                          <FillNowCell
                            action={etf.action}
                            buyLabel={etf.last == null ? null : money(etf.buyAt, "INR")}
                            sellLabel={etf.last == null ? null : money(etf.sellAt, "INR")}
                          />
                          <td className={`px-3 py-1.5 text-right font-mono ${convictionClass(etf.conviction)}`}>
                            {convictionPct(etf.conviction)}
                          </td>
                          <td className={`px-3 py-1.5 text-right font-mono ${changeClass(etf.changePct)}`}>
                            {pct(etf.changePct)}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--muted)]">{etf.why}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">{LTP_REFERENCE_NOTE}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{DESK_UNIVERSE_NOTE}</p>
              </>
            )}
            {code === "gold" ? (
              <p className="mt-2 text-xs text-[var(--muted)]">{GOLD_ETF_NOT_IN_FEED}</p>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

function metalFooter(metal: MetalQuote, data: MetalsResponse | null) {
  return metalQuoteNote(metal.name, metal.lastUsd, metal.priceSource, data?.usdInr, data?.usdInrSource);
}

function MetalQuoteBoard({ metal }: { metal: MetalQuote }) {
  const digits = metalUsdDigits(metal.code);
  const prevCloseInr =
    metal.prevClose != null && metal.lastUsd != null && metal.lastInr != null && metal.lastUsd !== 0
      ? (metal.lastInr / metal.lastUsd) * metal.prevClose
      : null;
  const lastTrade = metal.asOf ?? "—";

  return (
    <div className="mt-4 overflow-x-auto border border-[var(--line)] bg-[var(--wash)]">
      <table className="w-full min-w-[28rem] text-left text-xs">
        <caption className="sr-only">
          COMEX and India last, change, close, high, low, and last trade time
        </caption>
        <thead className="text-[11px] tracking-wide text-[var(--muted)]">
          <tr>
            <th className="whitespace-nowrap px-3 py-1.5 font-medium">Quote</th>
            <th className="whitespace-nowrap px-3 py-1.5 text-right font-medium">US (COMEX)</th>
            <th className="whitespace-nowrap px-3 py-1.5 text-right font-medium">India</th>
          </tr>
        </thead>
        <tbody className="bg-white text-[var(--ink)]">
          <tr className="border-t border-[var(--line)]">
            <th className="px-3 py-1.5 font-medium text-[var(--muted)]">Last</th>
            <td className={`px-3 py-1.5 text-right font-mono ${changeClass(metal.changePct)}`}>
              {usd(metal.lastUsd, digits)}
            </td>
            <td className={`px-3 py-1.5 text-right font-mono ${changeClass(metal.changePct)}`}>
              {inr(metal.lastInr)}
            </td>
          </tr>
          <tr className="border-t border-[var(--line)]">
            <th className="px-3 py-1.5 font-medium text-[var(--muted)]">Change</th>
            <td className={`px-3 py-1.5 text-right font-mono ${changeClass(metal.changePct)}`}>
              {signedUsd(metal.changeUsd, digits)} {pct(metal.changePct)}
            </td>
            <td className={`px-3 py-1.5 text-right font-mono ${changeClass(metal.changePct)}`}>
              {pct(metal.changePct)}
            </td>
          </tr>
          <tr className="border-t border-[var(--line)]">
            <th className="px-3 py-1.5 font-medium text-[var(--muted)]">
              <HintLabel tipKey="close">Close</HintLabel>
            </th>
            <td className="px-3 py-1.5 text-right font-mono">{usd(metal.prevClose, digits)}</td>
            <td className="px-3 py-1.5 text-right font-mono">{inr(prevCloseInr)}</td>
          </tr>
          <tr className="border-t border-[var(--line)]">
            <th className="px-3 py-1.5 font-medium text-[var(--muted)]">High</th>
            <td className="px-3 py-1.5 text-right font-mono">{usd(metal.dayHigh, digits)}</td>
            <td className="px-3 py-1.5 text-right font-mono text-[var(--muted)]">—</td>
          </tr>
          <tr className="border-t border-[var(--line)]">
            <th className="px-3 py-1.5 font-medium text-[var(--muted)]">Low</th>
            <td className="px-3 py-1.5 text-right font-mono">{usd(metal.dayLow, digits)}</td>
            <td className="px-3 py-1.5 text-right font-mono text-[var(--muted)]">—</td>
          </tr>
          <tr className="border-t border-[var(--line)]">
            <th className="px-3 py-1.5 font-medium text-[var(--muted)]">Last trade</th>
            <td className="px-3 py-1.5 text-right font-mono" colSpan={2}>
              {lastTrade}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
