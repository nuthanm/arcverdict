import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { HourBar } from "./daily-history";
import { fetchNseHourly } from "./daily-history";
import {
  FRESH_FROM,
  lastClosedNseSession,
  leadSessionOpen,
  nseClock,
  sessionScanDate,
  type DeskStatus,
  type FreshLead,
} from "./desk-book";
import type { DailyLifecycleRow } from "./lifecycle";
import { findDowntrendSell, findUptrendBuy, isUptrend } from "./session-reversal";
import { NIFTY_UNIVERSE } from "./universe";
import { nseSymbol, quoteBySymbol, fetchYahooQuotes, type YahooQuote } from "./yahoo";

export const HISTORY_AFTER_SELL_MS = 15 * 60 * 1000;

export type CandlePoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  ema50: number | null;
  highlight: boolean;
};

export type ActiveLead = FreshLead & {
  entryPrice: number | null;
  currentPrice: number | null;
  supportPrice: number | null;
  signalLow: number | null;
  candles: CandlePoint[];
  chartSource: string;
  chartUrl: string;
};

export type MonitorLead = {
  company: string;
  signalDate: string;
  leadFor: string;
  entryPrice: number;
  status: DeskStatus;
  statusNote: string;
  resistancePrice: number | null;
  sellValue: number | null;
  lastPrice: number | null;
  trend: string | null;
  sellMarkedAt: string | null;
};

export type HistoricalLead = {
  company: string;
  signalDate: string;
  leadFor: string;
  entryPrice: number;
  previousClose: number | null;
  supportPrice: number | null;
  trend: string | null;
  healthState: string | null;
  pressure: string | null;
  structureState: string | null;
  statusNote: string;
  lastPrice: number | null;
  resistancePrice: number | null;
  sellValue: number;
  soldOn: string;
  reason: string;
};

type OpenLead = {
  company: string;
  signalDate: string;
  leadFor: string;
  entryPrice: number;
  previousClose: number | null;
  supportPrice: number | null;
  trend: string | null;
  healthState: string | null;
  pressure: string | null;
  structureState: string | null;
  signalLow: number | null;
  confirmLabel?: string | null;
  rule?: string | null;
  sellValue: number | null;
  sellOn: string | null;
  sellMarkedAt?: string | null;
  reason: string | null;
};

type VoidedLead = {
  company: string;
  signalDate: string;
};

type Ledger = {
  freshFrom: string;
  open: OpenLead[];
  historical: HistoricalLead[];
  voided: VoidedLead[];
};

const ledgerPath = path.join(process.cwd(), "data", "lead-ledger.json");
const runtimeLedgerPath = path.join(tmpdir(), "arcverdict-lead-ledger.json");

function emptyLedger(): Ledger {
  return { freshFrom: FRESH_FROM, open: [], historical: [], voided: [] };
}

function parseLedger(file: string): Ledger | null {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Ledger;
    if (parsed.freshFrom !== FRESH_FROM || !Array.isArray(parsed.historical)) return null;
    return {
      freshFrom: FRESH_FROM,
      open: Array.isArray(parsed.open) ? parsed.open.filter((row) => row.signalDate >= FRESH_FROM) : [],
      historical: parsed.historical.filter((row) => row.signalDate >= FRESH_FROM).map(normalizeHistorical),
      voided: Array.isArray(parsed.voided) ? parsed.voided.filter((row) => row.signalDate >= FRESH_FROM) : [],
    };
  } catch {
    return null;
  }
}

function loadLedger(): Ledger {
  return parseLedger(runtimeLedgerPath) ?? parseLedger(ledgerPath) ?? emptyLedger();
}

function saveLedger(ledger: Ledger) {
  const payload = JSON.stringify(ledger);
  try {
    writeFileSync(ledgerPath, payload);
  } catch {
    try {
      writeFileSync(runtimeLedgerPath, payload);
    } catch {
      // A read-only host still returns the book. The next request recomputes it from the hourly bars.
    }
  }
}

export function chartSource(symbol: string) {
  return `Yahoo Finance 30-minute candles for ${symbol}.NS. Entry is the pullback high in a rising 50-bar EMA uptrend`
}

export function chartUrl(symbol: string) {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(`${symbol}.NS`)}/chart`;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

const HOURLY_EMA = 50;
const HOURLY_BARS = 200;

function ema50(closes: number[]) {
  const out: Array<number | null> = Array(closes.length).fill(null);
  if (closes.length < HOURLY_EMA) return out;
  let seed = 0;
  for (let i = 0; i < HOURLY_EMA; i++) seed += closes[i];
  let prev = seed / HOURLY_EMA;
  out[HOURLY_EMA - 1] = prev;
  const k = 2 / (HOURLY_EMA + 1);
  for (let i = HOURLY_EMA; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * Support is the low of the bar that met the 50-bar EMA. It counts only when the
 * next two bars both close above that average and the second of them finishes above
 * the support bar. A single green bar is not used.
 */
function emaSupport(bars: HourBar[], ema: Array<number | null>) {
  let chosen: { index: number; support: number } | null = null;
  for (let i = HOURLY_EMA - 1; i + 2 < bars.length; i++) {
    const average = ema[i];
    const nextAverage = ema[i + 1];
    const thirdAverage = ema[i + 2];
    if (average == null || nextAverage == null || thirdAverage == null) continue;
    const bar = bars[i];
    const first = bars[i + 1];
    const second = bars[i + 2];
    const metAverage = bar.low <= average && bar.close >= average;
    const heldAbove = first.close > nextAverage && second.close > thirdAverage && first.close > bar.low && second.close > bar.low;
    const finishedHigher = second.close > bar.close;
    if (!metAverage || !heldAbove || !finishedHigher) continue;
    chosen = { index: i, support: bar.low };
  }
  return chosen;
}

/**
 * Resistance is the mirror of support, and only after that support. It is the high of
 * the bar that met the 50-bar EMA on the way down. It counts when the next two bars
 * both close below that average and the second finishes below the rejection bar.
 */
function emaResistance(bars: HourBar[], ema: Array<number | null>, afterIndex: number, supportPrice: number) {
  let chosen: { index: number; resistance: number } | null = null;
  for (let i = Math.max(HOURLY_EMA - 1, afterIndex + 1); i + 2 < bars.length; i++) {
    const average = ema[i];
    const nextAverage = ema[i + 1];
    const thirdAverage = ema[i + 2];
    if (average == null || nextAverage == null || thirdAverage == null) continue;
    const bar = bars[i];
    const first = bars[i + 1];
    const second = bars[i + 2];
    const metAverage = bar.high >= average && bar.close <= average && bar.high > supportPrice;
    const heldBelow =
      first.close < nextAverage &&
      second.close < thirdAverage &&
      first.close < bar.high &&
      second.close < bar.high;
    const finishedLower = second.close < bar.close;
    if (!metAverage || !heldBelow || !finishedLower) continue;
    chosen = { index: i, resistance: bar.high };
  }
  return chosen;
}

function hourlyReversalChart(bars: HourBar[], mark?: { from: number; to: number } | null) {
  const ema = ema50(bars.map((bar) => bar.close));
  const support = emaSupport(bars, ema);
  const resistance = support ? emaResistance(bars, ema, support.index, support.support) : null;
  const windowStart = Math.max(0, bars.length - HOURLY_BARS);
  const candles: CandlePoint[] = bars.slice(windowStart).map((bar, offset) => {
    const index = windowStart + offset;
    return {
      date: `${bar.date} ${bar.label}`,
      open: round2(bar.open),
      high: round2(bar.high),
      low: round2(bar.low),
      close: round2(bar.close),
      ema50: ema[index] == null ? null : round2(ema[index]),
      highlight: mark != null && index >= mark.from && index <= mark.to,
    };
  });
  return {
    candles,
    supportPrice: support ? round2(support.support) : null,
    resistancePrice: resistance ? round2(resistance.resistance) : null,
  };
}

function quotePrice(quote: YahooQuote | null) {
  const price = quote?.regularMarketPrice;
  return price != null && price > 0 ? price : null;
}

function markSell(position: OpenLead, price: number, soldOn: string, reason: string, now: Date) {
  position.sellValue = price;
  position.sellOn = soldOn;
  position.reason = reason;
  if (!position.sellMarkedAt) position.sellMarkedAt = now.toISOString();
}

function istDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function alreadySold(ledger: Ledger, company: string, signalDate: string) {
  return ledger.historical.some((row) => row.company === company && row.signalDate === signalDate);
}

function hasOpenLead(ledger: Ledger, company: string) {
  return ledger.open.some((row) => row.company === company);
}

function normalizeHistorical(row: HistoricalLead): HistoricalLead {
  return {
    company: row.company,
    signalDate: row.signalDate,
    leadFor: row.leadFor,
    entryPrice: row.entryPrice,
    previousClose: row.previousClose ?? null,
    supportPrice: row.supportPrice ?? null,
    trend: row.trend ?? null,
    healthState: row.healthState ?? null,
    pressure: row.pressure ?? null,
    structureState: row.structureState ?? null,
    statusNote: row.statusNote ?? row.reason ?? "Sell — reversal sell formed",
    lastPrice: row.lastPrice ?? null,
    resistancePrice: row.resistancePrice ?? null,
    sellValue: row.sellValue,
    soldOn: row.soldOn,
    reason: row.reason ?? "Reversal sell formed",
  };
}

function archive(
  ledger: Ledger,
  position: OpenLead,
  exit: { soldOn: string; lastPrice: number | null; resistancePrice: number | null; statusNote: string },
) {
  if (position.sellValue == null) return;
  ledger.historical.push(
    normalizeHistorical({
      company: position.company,
      signalDate: position.signalDate,
      leadFor: position.leadFor,
      entryPrice: position.entryPrice,
      previousClose: position.previousClose,
      supportPrice: position.supportPrice,
      trend: position.trend,
      healthState: position.healthState,
      pressure: position.pressure,
      structureState: position.structureState,
      statusNote: exit.statusNote,
      lastPrice: exit.lastPrice,
      resistancePrice: exit.resistancePrice,
      sellValue: position.sellValue,
      soldOn: exit.soldOn,
      reason: position.reason ?? "Reversal sell formed",
    }),
  );
  ledger.open = ledger.open.filter((row) => !(row.company === position.company && row.signalDate === position.signalDate));
}

function scanSymbols(history: Record<string, DailyLifecycleRow[]>) {
  const etf = new Set(NIFTY_UNIVERSE.filter((row) => row.kind === "etf").map((row) => row.ticker));
  const symbols = new Set<string>();
  for (const ticker of Object.keys(history)) {
    if (!etf.has(ticker)) symbols.add(ticker);
  }
  for (const row of NIFTY_UNIVERSE) {
    if (row.kind !== "etf") symbols.add(row.ticker);
  }
  return [...symbols];
}

function contextBefore(rows: DailyLifecycleRow[] | undefined, sessionDate: string) {
  return latestDaily(rows, sessionDate, false);
}

function latestDaily(rows: DailyLifecycleRow[] | undefined, through: string, inclusive: boolean) {
  let chosen: DailyLifecycleRow | null = null;
  for (const row of rows ?? []) {
    if (!row.date) continue;
    if (inclusive ? row.date > through : row.date >= through) continue;
    if (!chosen?.date || row.date > chosen.date) chosen = row;
  }
  return chosen;
}

/** Weekdays from the fresh start through the last session that is allowed to seed a lead. */
function bookedSessions(through: string) {
  const dates: string[] = [];
  const [year, month, day] = FRESH_FROM.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  while (true) {
    const iso = cursor.toISOString().slice(0, 10);
    if (iso > through) break;
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) dates.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function leadFromPosition(position: OpenLead, now: Date): FreshLead {
  return {
    company: position.company,
    signalDate: position.signalDate,
    leadFor: position.leadFor,
    close: position.previousClose,
    trend: position.trend,
    healthState: position.healthState,
    pressure: position.pressure,
    structureState: position.structureState,
    sessionOpen: leadSessionOpen(position.leadFor, now),
  };
}

function lastSessionClose(hours: HourBar[], leadFor: string) {
  let close: number | null = null;
  for (const bar of hours) {
    if (bar.date === leadFor && bar.label !== "15:30") close = bar.close;
  }
  return close == null ? null : round2(close);
}

export async function assembleForwardBook(
  history: Record<string, DailyLifecycleRow[]>,
  asOf: string | null,
  now = new Date(),
) {
  const clock = nseClock(now);
  const liveSession = sessionScanDate(now);
  // Before the next open, keep scanning the session that just closed. A confirmed
  // uptrend buy stays on the book through that close.
  const scanThrough = liveSession ?? lastClosedNseSession(now);
  const ledger = loadLedger();
  const universe = [...new Set([...scanSymbols(history), ...ledger.open.map((row) => row.company)])];
  const hourlyRows = universe.length ? await fetchNseHourly(universe) : [];
  const hourlyBySymbol = new Map(hourlyRows.map((row) => [row.ticker, row.bars]));
  let ledgerChanged = false;

  for (const position of [...ledger.open]) {
    if (position.rule === "uptrend") continue;
    ledger.open = ledger.open.filter((row) => row !== position);
    ledgerChanged = true;
  }

  const sessions = bookedSessions(scanThrough);
  for (const company of universe) {
    if (hasOpenLead(ledger, company)) continue;
    const hours = hourlyBySymbol.get(company) ?? [];
    for (const sessionDate of sessions) {
      if (alreadySold(ledger, company, sessionDate)) continue;
      const context = contextBefore(history[company], sessionDate);
      if (!isUptrend(context?.trend ?? null)) continue;
      const hit = findUptrendBuy(hours, sessionDate, now);
      if (hit.state !== "confirmed") continue;
      ledger.open.push({
        company,
        signalDate: sessionDate,
        leadFor: sessionDate,
        entryPrice: hit.entryPrice,
        previousClose: context?.close ?? null,
        supportPrice: hit.supportPrice,
        trend: context?.trend ?? null,
        healthState: context?.healthState ?? null,
        pressure: context?.pressure ?? null,
        structureState: context?.structureState ?? null,
        signalLow: hit.supportPrice,
        confirmLabel: hit.confirmLabel,
        rule: "uptrend",
        sellValue: null,
        sellOn: null,
        sellMarkedAt: null,
        reason: null,
      });
      ledgerChanged = true;
      break;
    }
  }

  let quotes: YahooQuote[] = [];
  const quoteNames = [...new Set(ledger.open.map((row) => row.company))];
  if (quoteNames.length) {
    try {
      quotes = await fetchYahooQuotes(quoteNames.map((ticker) => nseSymbol(ticker)));
    } catch {
      quotes = [];
    }
  }

  const monitoring: MonitorLead[] = [];
  const today = istDate(now);

  for (const position of [...ledger.open]) {
    const hours = hourlyBySymbol.get(position.company) ?? [];
    const quote = quoteBySymbol(quotes, nseSymbol(position.company));
    const latest = latestDaily(history[position.company], clock.closedThrough, true);
    if (latest && position.trend !== latest.trend) {
      position.trend = latest.trend ?? position.trend;
      position.healthState = latest.healthState ?? position.healthState;
      position.pressure = latest.pressure ?? position.pressure;
      position.structureState = latest.structureState ?? position.structureState;
      ledgerChanged = true;
    }
    if (position.confirmLabel && position.sellValue == null) {
      const broke = findDowntrendSell(hours, position.leadFor, position.confirmLabel, now);
      if (broke) {
        markSell(position, broke.sellPrice, broke.soldOn, "Sell — downtrend broke the 50-bar EMA", now);
        ledgerChanged = true;
      }
    }

    const hit = position.confirmLabel ? findUptrendBuy(hours, position.leadFor, now) : null;
    const mark = hit && hit.state !== "none" ? { from: hit.probeIndex, to: hit.confirmIndex } : null;
    const structure = hourlyReversalChart(hours, mark);
    const formed = position.sellValue != null;
    const statusNote = formed
      ? "Sell printed. This lead is no longer monitored and moves to history after 15 min."
      : "Hold — the 50-bar average has not broken in a downtrend";
    const lastPrice = quotePrice(quote) ?? lastSessionClose(hours, position.leadFor) ?? position.previousClose;
    const markedAt = position.sellMarkedAt ? Date.parse(position.sellMarkedAt) : NaN;

    if (formed && Number.isFinite(markedAt) && now.getTime() >= markedAt + HISTORY_AFTER_SELL_MS) {
      archive(ledger, position, {
        soldOn: position.sellOn ?? today,
        lastPrice,
        resistancePrice: structure.resistancePrice,
        statusNote,
      });
      ledgerChanged = true;
      continue;
    }
    monitoring.push({
      company: position.company,
      signalDate: position.signalDate,
      leadFor: position.leadFor,
      entryPrice: position.entryPrice,
      status: formed ? "SELL" : "HOLD",
      statusNote,
      resistancePrice: structure.resistancePrice,
      sellValue: position.sellValue,
      lastPrice,
      trend: position.trend,
      sellMarkedAt: position.sellMarkedAt ?? null,
    });
  }

  if (ledgerChanged) saveLedger(ledger);

  const asActive = (position: OpenLead): ActiveLead => {
    const lead = leadFromPosition(position, now);
    const hours = hourlyBySymbol.get(position.company) ?? [];
    const hit = position.confirmLabel ? findUptrendBuy(hours, position.leadFor, now) : null;
    const mark = hit && hit.state !== "none" ? { from: hit.probeIndex, to: hit.confirmIndex } : null;
    const chart = hourlyReversalChart(hours, mark);
    const live = quotePrice(quoteBySymbol(quotes, nseSymbol(position.company)));
    return {
      ...lead,
      entryPrice: position.entryPrice,
      currentPrice: live != null ? round2(live) : lastSessionClose(hours, position.leadFor) ?? position.previousClose,
      supportPrice: position.supportPrice ?? chart.supportPrice,
      signalLow: position.signalLow,
      candles: chart.candles,
      chartSource: chartSource(position.company),
      chartUrl: chartUrl(position.company),
    };
  };
  // Open leads stay on table 1 through the session close, including the 15 minutes
  // after the sell prints. Archive is what moves them to history.
  const leads = ledger.open.map((position) => asActive(position));
  leads.sort((a, b) => a.company.localeCompare(b.company));

  const monitoringWithEntry = monitoring.filter((row) => row.entryPrice != null);
  monitoringWithEntry.sort((a, b) => {
    if (a.status !== b.status) return a.status === "SELL" ? -1 : 1;
    return a.company.localeCompare(b.company);
  });
  const historical = [...ledger.historical].sort(
    (a, b) => b.soldOn.localeCompare(a.soldOn) || a.company.localeCompare(b.company),
  );

  return {
    asOf,
    closedThrough: clock.closedThrough,
    marketOpen: clock.marketOpen,
    awaitingClose: clock.marketOpen,
    freshFrom: FRESH_FROM,
    leads,
    monitoring: monitoringWithEntry,
    historical,
  };
}
