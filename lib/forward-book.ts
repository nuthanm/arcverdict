import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DailyBar, HourBar } from "./daily-history";
import { fetchNseCandles, fetchNseHourly } from "./daily-history";
import {
  FRESH_FROM,
  freshReversalLeads,
  leadSessionClosed,
  sellAfterSignal,
  type DeskStatus,
  type FreshLead,
} from "./desk-book";
import type { DailyLifecycleRow } from "./lifecycle";
import { nseSymbol, quoteBySymbol, fetchYahooQuotes, type YahooQuote } from "./yahoo";

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
  sellValue: number | null;
  sellOn: string | null;
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

function emptyLedger(): Ledger {
  return { freshFrom: FRESH_FROM, open: [], historical: [], voided: [] };
}

function loadLedger(): Ledger {
  try {
    const parsed = JSON.parse(readFileSync(ledgerPath, "utf8")) as Ledger;
    if (parsed.freshFrom !== FRESH_FROM || !Array.isArray(parsed.historical)) return emptyLedger();
    return {
      freshFrom: FRESH_FROM,
      open: Array.isArray(parsed.open) ? parsed.open.filter((row) => row.signalDate >= FRESH_FROM) : [],
      historical: parsed.historical.filter((row) => row.signalDate >= FRESH_FROM).map(normalizeHistorical),
      voided: Array.isArray(parsed.voided) ? parsed.voided.filter((row) => row.signalDate >= FRESH_FROM) : [],
    };
  } catch {
    return emptyLedger();
  }
}

function saveLedger(ledger: Ledger) {
  writeFileSync(ledgerPath, JSON.stringify(ledger));
}

export function chartSource(symbol: string) {
  return `Yahoo Finance 1-hour candles for ${symbol}.NS, the NSE cash series. Lead uses the 50-hour EMA`;
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
 * Support is the low of the hour that met the 50-hour EMA. It counts only when the
 * next two hours both close above that average and the second of them finishes above
 * the support hour. A single green hour is not used.
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
 * the hour that met the 50-hour EMA on the way down. It counts when the next two hours
 * both close below that average and the second finishes below the rejection hour.
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

function hourlyReversalChart(bars: HourBar[]) {
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
      highlight: support != null && index >= support.index && index <= support.index + 2,
    };
  });
  return {
    candles,
    supportPrice: support ? round2(support.support) : null,
    resistancePrice: resistance ? round2(resistance.resistance) : null,
  };
}

function signalLow(bars: DailyBar[], signalDate: string) {
  const exact = bars.find((bar) => bar.date === signalDate);
  const prior = exact ?? [...bars].reverse().find((bar) => bar.date <= signalDate);
  return prior ? round2(prior.low) : null;
}

function quotePrice(quote: YahooQuote | null) {
  const price = quote?.regularMarketPrice;
  return price != null && price > 0 ? price : null;
}

function quoteOnSession(quote: YahooQuote | null, leadFor: string) {
  const time = quote?.regularMarketTime;
  if (time == null || !(time > 0)) return false;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time * 1000));
  return date === leadFor;
}

function labelMinutes(label: string) {
  const [hour, minute] = label.split(":").map(Number);
  return hour * 60 + minute;
}

/** A strong hour closes near its high with a real body, not a doji or a long upper wick. */
function isStrongBullHour(bar: HourBar) {
  const range = bar.high - bar.low;
  if (!(range > 0) || !(bar.close > bar.open) || !(bar.open > 0)) return false;
  const body = bar.close - bar.open;
  const upperWick = bar.high - bar.close;
  return body / range >= 0.6 && upperWick / range <= 0.2 && body / bar.open >= 0.005;
}

type EntryCheck = { state: "confirmed"; price: number } | { state: "broken" } | { state: "waiting" };

/**
 * Entry is the first higher high between two consecutive strong hours on the lead session.
 * The fill is the first hour's high, the price the second hour had to trade to make that high.
 * A dip under support before that pair invalidates the lead. Holding support alone is not an entry.
 */
function higherHighEntry(hours: HourBar[], leadFor: string, support: number | null): EntryCheck {
  if (support == null) return { state: "waiting" };
  const session = hours
    .filter((bar) => bar.date === leadFor && bar.label !== "15:30")
    .sort((a, b) => a.label.localeCompare(b.label));
  for (let i = 0; i < session.length; i++) {
    const bar = session[i];
    if (bar.low < support) return { state: "broken" };
    if (i === 0) continue;
    const first = session[i - 1];
    const gap = labelMinutes(bar.label) - labelMinutes(first.label);
    if (!(gap > 0 && gap <= 75)) continue;
    if (!isStrongBullHour(first) || !isStrongBullHour(bar)) continue;
    if (!(bar.high > first.high) || !(bar.close > first.close)) continue;
    const price = bar.low > first.high ? bar.open : first.high;
    return { state: "confirmed", price: round2(price) };
  }
  return { state: "waiting" };
}

function liveBrokeSupport(quote: YahooQuote | null, bars: DailyBar[], leadFor: string, support: number | null) {
  if (support == null) return false;
  const today = bars.find((bar) => bar.date === leadFor);
  if (today && today.low > 0 && today.low < support) return true;
  if (!quoteOnSession(quote, leadFor)) return false;
  const price = quotePrice(quote);
  const dayLow = quote?.regularMarketDayLow;
  return (price != null && price < support) || (dayLow != null && dayLow > 0 && dayLow < support);
}

function liveSell(quote: YahooQuote | null, low: number | null) {
  if (low == null) return null;
  const price = quotePrice(quote);
  const dayLow = quote?.regularMarketDayLow;
  const pierced = (price != null && price <= low) || (dayLow != null && dayLow > 0 && dayLow <= low);
  if (!pierced) return null;
  const print = price != null && price <= low ? price : dayLow != null && dayLow <= low ? dayLow : price;
  return print == null ? null : round2(print);
}

function resistanceState(resistancePrice: number | null): { status: DeskStatus; statusNote: string } {
  if (resistancePrice == null) {
    return { status: "HOLD", statusNote: "Hold — rally has not rejected the 50-hour EMA" };
  }
  return { status: "SELL", statusNote: "Sell — resistance rejected, down reversal confirmed" };
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

function alreadyVoided(ledger: Ledger, company: string, signalDate: string) {
  return ledger.voided.some((row) => row.company === company && row.signalDate === signalDate);
}

function voidLead(ledger: Ledger, company: string, signalDate: string) {
  if (!alreadyVoided(ledger, company, signalDate)) ledger.voided.push({ company, signalDate });
  ledger.open = ledger.open.filter((row) => !(row.company === company && row.signalDate === signalDate));
}

function findOpen(ledger: Ledger, company: string, signalDate: string) {
  return ledger.open.find((row) => row.company === company && row.signalDate === signalDate) ?? null;
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

export async function assembleForwardBook(
  history: Record<string, DailyLifecycleRow[]>,
  asOf: string | null,
  now = new Date(),
) {
  const discovered = freshReversalLeads(history, now);
  const ledger = loadLedger();
  const waiting: FreshLead[] = [];
  const due: FreshLead[] = [];

  for (const lead of discovered.leads) {
    if (alreadySold(ledger, lead.company, lead.signalDate)) continue;
    if (alreadyVoided(ledger, lead.company, lead.signalDate)) continue;
    if (lead.sessionOpen || findOpen(ledger, lead.company, lead.signalDate)) due.push(lead);
    else waiting.push(lead);
  }

  const chartTickers = [...new Set([...waiting, ...due].map((lead) => lead.company))];
  const [candleRows, hourlyRows] = chartTickers.length
    ? await Promise.all([fetchNseCandles(chartTickers), fetchNseHourly(chartTickers)])
    : [[], []];
  const candlesBySymbol = new Map(candleRows.map((row) => [row.ticker, row.bars]));
  const hourlyBySymbol = new Map(hourlyRows.map((row) => [row.ticker, row.bars]));

  let quotes: YahooQuote[] = [];
  const quoteTickers = discovered.marketOpen ? chartTickers : due.map((lead) => lead.company);
  if (quoteTickers.length) {
    try {
      quotes = await fetchYahooQuotes(quoteTickers.map((ticker) => nseSymbol(ticker)));
    } catch {
      quotes = [];
    }
  }

  const monitoring: MonitorLead[] = [];
  const stillWaiting: FreshLead[] = [...waiting];
  let ledgerChanged = false;
  const today = istDate(now);

  for (const lead of due) {
    const bars = candlesBySymbol.get(lead.company) ?? [];
    const low = signalLow(bars, lead.signalDate);
    const quote = quoteBySymbol(quotes, nseSymbol(lead.company));
    let position = findOpen(ledger, lead.company, lead.signalDate);

    if (!position) {
      const hours = hourlyBySymbol.get(lead.company) ?? [];
      const supportPrice = hourlyReversalChart(hours).supportPrice;
      const check = higherHighEntry(hours, lead.leadFor, supportPrice);
      if (check.state !== "confirmed") {
        const failed = check.state === "broken" || liveBrokeSupport(quote, bars, lead.leadFor, supportPrice);
        if (failed || leadSessionClosed(lead.leadFor, now)) {
          voidLead(ledger, lead.company, lead.signalDate);
          ledgerChanged = true;
          continue;
        }
        stillWaiting.push(lead);
        continue;
      }
      position = {
        company: lead.company,
        signalDate: lead.signalDate,
        leadFor: lead.leadFor,
        entryPrice: check.price,
        previousClose: lead.close,
        supportPrice,
        trend: lead.trend,
        healthState: lead.healthState,
        pressure: lead.pressure,
        structureState: lead.structureState,
        signalLow: low,
        sellValue: null,
        sellOn: null,
        reason: null,
      };
      ledger.open.push(position);
      ledgerChanged = true;
    }

    const daily = sellAfterSignal(history[lead.company] ?? [], lead.signalDate, discovered.closedThrough);
    if (position.sellValue == null && daily.sell) {
      position.sellValue = round2(daily.sell.exitClose);
      position.sellOn = daily.sell.exitDate;
      position.reason = daily.sell.reason;
      ledgerChanged = true;
    }
    const pierced = position.sellValue == null ? liveSell(quote, position.signalLow ?? low) : null;
    if (pierced != null) {
      position.sellValue = pierced;
      position.sellOn = today;
      position.reason = "Reversal sell formed — price traded through the signal-day low";
      ledgerChanged = true;
    }

    const hours = hourlyBySymbol.get(lead.company) ?? [];
    const structure = hourlyReversalChart(hours);
    const live = resistanceState(structure.resistancePrice);
    const formed = position.sellValue != null;
    const statusNote = formed ? "Sell — reversal sell formed" : live.statusNote;
    const lastPrice = quotePrice(quote) ?? daily.last?.close ?? lead.close;

    if (position.sellValue != null && position.sellOn && discovered.closedThrough >= position.sellOn) {
      archive(ledger, position, {
        soldOn: position.sellOn,
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
      status: formed ? "SELL" : live.status,
      statusNote,
      resistancePrice: structure.resistancePrice,
      sellValue: position.sellValue,
      lastPrice,
      trend: daily.last?.trend ?? lead.trend,
    });
  }

  if (ledgerChanged) saveLedger(ledger);

  const asActive = (lead: FreshLead, entryPrice: number | null): ActiveLead => {
    const bars = candlesBySymbol.get(lead.company) ?? [];
    const hours = hourlyBySymbol.get(lead.company) ?? [];
    const chart = hourlyReversalChart(hours);
    const live = quotePrice(quoteBySymbol(quotes, nseSymbol(lead.company)));
    return {
      ...lead,
      entryPrice,
      currentPrice: discovered.marketOpen && live != null ? round2(live) : lead.close,
      supportPrice: chart.supportPrice,
      signalLow: signalLow(bars, lead.signalDate),
      candles: chart.candles,
      chartSource: chartSource(lead.company),
      chartUrl: chartUrl(lead.company),
    };
  };
  const leads: ActiveLead[] = stillWaiting.map((lead) => asActive(lead, null));
  for (const position of ledger.open) {
    const lead = discovered.leads.find(
      (row) => row.company === position.company && row.signalDate === position.signalDate,
    );
    if (!lead || leads.some((row) => row.company === position.company && row.signalDate === position.signalDate)) {
      continue;
    }
    leads.push(asActive(lead, position.entryPrice));
  }
  leads.sort((a, b) => a.company.localeCompare(b.company));

  const monitoringWithEntry = monitoring.filter((row) =>
    leads.some(
      (lead) => lead.company === row.company && lead.signalDate === row.signalDate && lead.entryPrice != null,
    ),
  );
  monitoringWithEntry.sort((a, b) => {
    if (a.status !== b.status) return a.status === "SELL" ? -1 : 1;
    return a.company.localeCompare(b.company);
  });
  const historical = [...ledger.historical].sort(
    (a, b) => b.soldOn.localeCompare(a.soldOn) || a.company.localeCompare(b.company),
  );

  return {
    asOf,
    closedThrough: discovered.closedThrough,
    marketOpen: discovered.marketOpen,
    awaitingClose: discovered.awaitingClose,
    freshFrom: FRESH_FROM,
    leads,
    monitoring: monitoringWithEntry,
    historical,
  };
}
