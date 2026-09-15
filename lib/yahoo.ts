import { env } from "./env";

export type YahooQuote = {
  symbol?: string;
  regularMarketPrice?: number;
  bid?: number;
  ask?: number;
  regularMarketChangePercent?: number;
  regularMarketChange?: number;
  regularMarketTime?: number;
  previousClose?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  closeCount?: number;
  smaFastWindow?: number;
  smaSlowWindow?: number;
  exchangeTimezoneName?: string;
};

export type UsdInrQuote = {
  rate: number;
  source: "live" | "cached";
};

type ChartMeta = {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  bid?: number;
  ask?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketPreviousClose?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  gmtoffset?: number;
  exchangeTimezoneName?: string;
  timezone?: string;
  currentTradingPeriod?: unknown;
};

type ChartResult = {
  meta?: ChartMeta;
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>;
      close?: Array<number | null>;
      high?: Array<number | null>;
      low?: Array<number | null>;
    }>;
    adjclose?: Array<{
      adjclose?: Array<number | null>;
    }>;
  };
};

type ChartResponse = {
  chart?: {
    result?: ChartResult[];
  };
};

type SparkResponse = {
  spark?: {
    result?: Array<{
      symbol?: string;
      response?: ChartResult[];
    }>;
  };
};

type QuoteResult = {
  symbol?: string;
  regularMarketPrice?: number;
  bid?: number;
  ask?: number;
  regularMarketChangePercent?: number;
  regularMarketTime?: number;
  postMarketPrice?: number;
  postMarketTime?: number;
  preMarketPrice?: number;
  preMarketTime?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketPreviousClose?: number;
  regularMarketChange?: number;
};

type QuoteResponse = {
  quoteResponse?: {
    result?: Array<QuoteResult>;
  };
};

type LastField = "intraday_close" | "daily_close" | "regular_market" | "quote";

type LastPrint = {
  price: number;
  time?: number;
  field: LastField;
};

type BarPrint = {
  price: number;
  time?: number;
  index: number;
};

const USDINR_SYMBOLS = ["USDINR=X", "INR=X"] as const;
const USDINR_CACHE_MS = 6 * 60 * 60 * 1000;
const BAR_SEC_1M = 60;
const BAR_SEC_5M = 5 * 60;
const FETCH_MS = 8_000;
const SCAN_BUDGET_MS = 45_000;
const QUOTE_BATCH = 40;
const SPARK_BATCH = 20;
let cachedUsdInr: { rate: number; at: number } | null = null;

export type QuoteFetchOptions = {
  /** Prefer 1-minute bars for last + last-trade time (COMEX metals). Falls back to 5m. */
  prefer1m?: boolean;
};

function yahooHeaders() {
  const headers: Record<string, string> = {
    "User-Agent": env.marketDataUserAgent ?? "ArcVerdict/1.0",
    Accept: "application/json",
  };
  if (env.marketDataApiKey) {
    headers.Authorization = `Bearer ${env.marketDataApiKey}`;
  }
  return headers;
}

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

async function yahooFetch(url: string, attempt = 0): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      headers: yahooHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      return yahooFetch(url, attempt + 1);
    }
    return res;
  } catch {
    return null;
  }
}

function numericSeries(values: Array<number | null | undefined> | undefined) {
  return (values ?? []).filter((v): v is number => v != null && Number.isFinite(v));
}

function lastBar(
  values: Array<number | null | undefined> | undefined,
  timestamps: number[] | undefined,
): BarPrint | null {
  if (!values) return null;
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v != null && Number.isFinite(v) && v > 0) {
      return { price: v, time: timestamps?.[i], index: i };
    }
  }
  return null;
}

function exchangeDay(ts: number, gmtOffset: number) {
  return Math.floor((ts + gmtOffset) / 86400);
}

function sameExchangeDay(a?: number, b?: number, gmtOffset = 0) {
  if (a == null || b == null) return false;
  return exchangeDay(a, gmtOffset) === exchangeDay(b, gmtOffset);
}

function firstPositive(values: Array<number | null | undefined>) {
  for (const v of values) {
    if (v != null && Number.isFinite(v) && v > 0) return v;
  }
  return undefined;
}

function rangeOnExchangeDay(
  highs: Array<number | null | undefined> | undefined,
  lows: Array<number | null | undefined> | undefined,
  timestamps: number[] | undefined,
  anchorTs: number | undefined,
  gmtOffset: number,
): { high?: number; low?: number } {
  if (!highs || !lows || !timestamps || anchorTs == null) return {};
  let high: number | undefined;
  let low: number | undefined;
  const n = Math.min(highs.length, lows.length, timestamps.length);
  for (let i = 0; i < n; i++) {
    const t = timestamps[i];
    if (t == null || !sameExchangeDay(t, anchorTs, gmtOffset)) continue;
    const h = highs[i];
    const l = lows[i];
    if (h != null && Number.isFinite(h) && h > 0) high = high == null ? h : Math.max(high, h);
    if (l != null && Number.isFinite(l) && l > 0) low = low == null ? l : Math.min(low, l);
  }
  return { high, low };
}

function barOpen(
  opens: Array<number | null | undefined> | undefined,
  index: number | undefined,
) {
  if (opens == null || index == null) return undefined;
  const v = opens[index];
  if (v != null && Number.isFinite(v) && v > 0) return v;
  return undefined;
}

/**
 * COMEX board Close during Globex is prior settlement. Yahoo’s previous daily
 * close is often the prior session last (e.g. 4408.90); today’s daily open is
 * often the settlement boards print (e.g. 4375). Never use 1y chartPreviousClose
 * (first bar of a long-range chart).
 */
function pickPreviousClose(opts: {
  dailyPrev?: number;
  shortChartPrev?: number;
  quotePrev?: number;
  todayOpen?: number;
  closes: number[];
  daily: BarPrint | null;
  pickedTime?: number;
  gmtOffset: number;
}) {
  const { dailyPrev, shortChartPrev, quotePrev, todayOpen, closes, daily, pickedTime, gmtOffset } = opts;
  const dailyIsSameSession =
    daily?.time != null && pickedTime != null && sameExchangeDay(daily.time, pickedTime, gmtOffset);
  const prevCompleted = dailyIsSameSession && closes.length >= 2 ? closes[closes.length - 2] : undefined;
  const lastCompleted = !dailyIsSameSession && closes.length >= 1 ? closes[closes.length - 1] : undefined;
  if (dailyIsSameSession && todayOpen != null) return todayOpen;
  if (prevCompleted != null) return prevCompleted;
  if (lastCompleted != null) return lastCompleted;
  return firstPositive([todayOpen, dailyPrev, shortChartPrev, quotePrev]);
}

function asOfForIntraday(barTs?: number, metaTs?: number, barSec = BAR_SEC_5M) {
  if (barTs == null) return metaTs;
  if (metaTs != null && metaTs >= barTs && metaTs <= barTs + barSec) return metaTs;
  return barTs;
}

function printNewer(a?: number, b?: number) {
  return (a ?? 0) > (b ?? 0);
}

/** Newest last among 1m/5m bars and meta — chart bars can lag meta, and meta can lag bars. */
function pickLastPrint(opts: {
  daily: BarPrint | null;
  intraday: BarPrint | null;
  metaPrice?: number;
  metaTime?: number;
  gmtOffset: number;
  barSec: number;
}): LastPrint | null {
  const { daily, intraday, metaPrice, metaTime, gmtOffset, barSec } = opts;
  const meta =
    metaPrice != null && Number.isFinite(metaPrice) && metaPrice > 0
      ? { price: metaPrice, time: metaTime }
      : null;

  if (intraday) {
    const metaIsNewerLast =
      meta?.time != null && intraday.time != null && meta.time > intraday.time + barSec;
    if (metaIsNewerLast && meta) {
      return { price: meta.price, time: meta.time, field: "regular_market" };
    }
    return {
      price: intraday.price,
      time: asOfForIntraday(intraday.time, metaTime, barSec),
      field: "intraday_close",
    };
  }

  if (daily) {
    const metaIsNewerSession =
      meta?.time != null &&
      daily.time != null &&
      meta.time > daily.time &&
      !sameExchangeDay(daily.time, meta.time, gmtOffset);
    if (!metaIsNewerSession) {
      return {
        price: daily.price,
        time: sameExchangeDay(daily.time, metaTime, gmtOffset) ? (metaTime ?? daily.time) : daily.time,
        field: "daily_close",
      };
    }
  }

  if (meta) return { price: meta.price, time: meta.time, field: "regular_market" };
  if (daily) return { price: daily.price, time: daily.time, field: "daily_close" };
  return null;
}

function logLastDivergence(
  symbol: string,
  picked: LastPrint,
  daily: BarPrint | null,
  intraday: BarPrint | null,
  metaPrice?: number,
  metaTime?: number,
) {
  if (metaPrice == null || Math.abs(picked.price - metaPrice) < 0.0005) return;
  console.info("[arcverdict:last]", symbol, {
    picked: picked.price,
    field: picked.field,
    asOf: picked.time,
    chartDailyClose: daily?.price ?? null,
    chartDailyTs: daily?.time ?? null,
    chartIntradayClose: intraday?.price ?? null,
    chartIntradayTs: intraday?.time ?? null,
    regularMarketPrice: metaPrice,
    regularMarketTime: metaTime,
    quoteLast: null,
  });
}

const MIN_SMA_BARS = 3;

/** Last `n` closes, or all available bars when history is shorter than the requested window. */
function smaWithWindow(values: number[], n: number): { value: number; window: number } | undefined {
  if (values.length < MIN_SMA_BARS) return undefined;
  const window = Math.min(n, values.length);
  let sum = 0;
  for (let i = values.length - window; i < values.length; i++) sum += values[i];
  return { value: sum / window, window };
}

async function fetchChartJson(
  symbol: string,
  range: string,
  interval: string,
): Promise<ChartResult | null> {
  const url = `${env.marketDataBaseUrl}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await yahooFetch(url);
  if (!res?.ok) return null;
  try {
    const json = (await res.json()) as ChartResponse;
    return json.chart?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchIntradayChart(symbol: string, prefer1m: boolean) {
  if (prefer1m) {
    const [oneMin, oneMin5d] = await Promise.all([
      fetchChartJson(symbol, "1d", "1m"),
      fetchChartJson(symbol, "5d", "1m"),
    ]);
    const oneMinBar = lastBar(oneMin?.indicators?.quote?.[0]?.close, oneMin?.timestamp);
    const fiveDayBar = lastBar(oneMin5d?.indicators?.quote?.[0]?.close, oneMin5d?.timestamp);
    const fiveDayNewer = fiveDayBar && (!oneMinBar || printNewer(fiveDayBar.time, oneMinBar.time));
    if (fiveDayNewer) return { result: oneMin5d, barSec: BAR_SEC_1M, range: "5d" as const };
    if (oneMinBar) return { result: oneMin, barSec: BAR_SEC_1M, range: "1d" as const };
    const fiveMin = await fetchChartJson(symbol, "5d", "5m");
    if (lastBar(fiveMin?.indicators?.quote?.[0]?.close, fiveMin?.timestamp)) {
      return { result: fiveMin, barSec: BAR_SEC_5M, range: "5d" as const };
    }
    return { result: oneMin5d ?? oneMin ?? fiveMin, barSec: BAR_SEC_1M, range: "5d" as const };
  }
  const fiveMin = await fetchChartJson(symbol, "5d", "5m");
  return { result: fiveMin, barSec: BAR_SEC_5M, range: "5d" as const };
}

async function fetchChart(
  symbol: string,
  periods: { smaFast: number; smaSlow: number },
  opts: QuoteFetchOptions = {},
): Promise<YahooQuote | null> {
  const range = periods.smaSlow > 220 ? "2y" : "1y";
  const prefer1m = Boolean(opts.prefer1m);
  const [dailyResult, shortDaily, intradayPack] = await Promise.all([
    fetchChartJson(symbol, range, "1d"),
    prefer1m ? fetchChartJson(symbol, "5d", "1d") : Promise.resolve(null),
    prefer1m
      ? fetchIntradayChart(symbol, true)
      : Promise.resolve({ result: null as ChartResult | null, barSec: BAR_SEC_5M, range: "5d" as const }),
  ]);
  if (!dailyResult) return fetchQuoteSnapshot(symbol);

  const rawClose = dailyResult.indicators?.quote?.[0]?.close ?? [];
  const adjClose = dailyResult.indicators?.adjclose?.[0]?.adjclose ?? [];
  const useAdj = !rawClose.some((v) => v != null);
  const closeSeries = useAdj ? adjClose : rawClose;
  const closes = numericSeries(closeSeries);
  const highs = dailyResult.indicators?.quote?.[0]?.high ?? [];
  const lows = dailyResult.indicators?.quote?.[0]?.low ?? [];
  const opens = dailyResult.indicators?.quote?.[0]?.open ?? [];
  const daily = lastBar(closeSeries, dailyResult.timestamp);
  const lastHigh = [...highs].reverse().find((v) => v != null);
  const lastLow = [...lows].reverse().find((v) => v != null);

  const intradayResult = intradayPack.result;
  const barSec = intradayPack.barSec;
  const intraQuote = intradayResult?.indicators?.quote?.[0];
  const intraday = lastBar(intraQuote?.close, intradayResult?.timestamp);
  const gmtOffset = dailyResult.meta?.gmtoffset ?? intradayResult?.meta?.gmtoffset ?? 0;
  const intraMetaNewer = printNewer(
    intradayResult?.meta?.regularMarketTime,
    dailyResult.meta?.regularMarketTime,
  );
  const metaPrice = intraMetaNewer
    ? (intradayResult?.meta?.regularMarketPrice ?? dailyResult.meta?.regularMarketPrice)
    : (dailyResult.meta?.regularMarketPrice ?? intradayResult?.meta?.regularMarketPrice);
  const metaTime = intraMetaNewer
    ? (intradayResult?.meta?.regularMarketTime ?? dailyResult.meta?.regularMarketTime)
    : (dailyResult.meta?.regularMarketTime ?? intradayResult?.meta?.regularMarketTime);

  const picked = pickLastPrint({
    daily,
    intraday,
    metaPrice,
    metaTime,
    gmtOffset,
    barSec,
  });
  if (!picked) return fetchQuoteSnapshot(symbol);
  logLastDivergence(symbol, picked, daily, intraday, metaPrice, metaTime);

  const sessionRange = rangeOnExchangeDay(
    intraQuote?.high,
    intraQuote?.low,
    intradayResult?.timestamp,
    picked.time ?? metaTime,
    gmtOffset,
  );
  const shortOpens = shortDaily?.indicators?.quote?.[0]?.open ?? [];
  const shortCloses = numericSeries(shortDaily?.indicators?.quote?.[0]?.close);
  const shortDailyBar = lastBar(shortDaily?.indicators?.quote?.[0]?.close, shortDaily?.timestamp);
  const todayOpen = firstPositive([
    barOpen(opens, daily?.index),
    barOpen(shortOpens, shortDailyBar?.index),
    shortDaily?.meta?.regularMarketOpen,
    dailyResult.meta?.regularMarketOpen,
    intradayResult?.meta?.regularMarketOpen,
  ]);
  const shortChartPrev = firstPositive([
    shortDaily?.meta?.chartPreviousClose,
    shortDaily?.meta?.previousClose,
    intradayResult?.meta?.previousClose,
    intradayPack.range === "1d" ? intradayResult?.meta?.chartPreviousClose : undefined,
  ]);
  const prevCompleted =
    daily &&
    picked.time != null &&
    sameExchangeDay(daily.time, picked.time, gmtOffset) &&
    closes.length >= 2
      ? closes[closes.length - 2]
      : shortCloses.length >= 2
        ? shortCloses[shortCloses.length - 2]
        : undefined;
  const prevClose = pickPreviousClose({
    dailyPrev: dailyResult.meta?.previousClose ?? shortDaily?.meta?.previousClose,
    shortChartPrev,
    quotePrev: dailyResult.meta?.regularMarketPreviousClose ?? shortDaily?.meta?.regularMarketPreviousClose,
    todayOpen,
    closes,
    daily,
    pickedTime: picked.time,
    gmtOffset,
  });
  if (opts.prefer1m) {
    console.info(
      "[arcverdict:close]",
      JSON.stringify({
        symbol,
        picked: prevClose,
        todayOpen: todayOpen ?? null,
        prevCompletedDailyClose: prevCompleted ?? null,
        lastDailyClose: daily?.price ?? null,
        chartPreviousClose5d: shortDaily?.meta?.chartPreviousClose ?? null,
        chartPreviousClose1m: intradayResult?.meta?.chartPreviousClose ?? null,
        metaPreviousClose: dailyResult.meta?.previousClose ?? intradayResult?.meta?.previousClose ?? null,
        lastUsd: picked.price,
        asOf: picked.time ?? null,
      }),
    );
  }
  const dayHigh = firstPositive([
    intradayResult?.meta?.regularMarketDayHigh,
    dailyResult.meta?.regularMarketDayHigh,
    sessionRange.high,
    lastHigh,
  ]);
  const dayLow = firstPositive([
    intradayResult?.meta?.regularMarketDayLow,
    dailyResult.meta?.regularMarketDayLow,
    sessionRange.low,
    lastLow,
  ]);
  const change = prevClose != null ? picked.price - prevClose : undefined;
  const changePct =
    change != null && prevClose != null && prevClose !== 0 ? (change / prevClose) * 100 : undefined;

  const fast = smaWithWindow(closes, periods.smaFast);
  const slow = smaWithWindow(closes, periods.smaSlow);
  return {
    symbol,
    regularMarketPrice: picked.price,
    bid: dailyResult.meta?.bid ?? intradayResult?.meta?.bid,
    ask: dailyResult.meta?.ask ?? intradayResult?.meta?.ask,
    regularMarketChangePercent: changePct,
    regularMarketChange: change,
    previousClose: prevClose,
    regularMarketTime: picked.time,
    fiftyDayAverage: fast?.value ?? dailyResult.meta?.fiftyDayAverage,
    twoHundredDayAverage: slow?.value ?? dailyResult.meta?.twoHundredDayAverage,
    regularMarketDayHigh: dayHigh,
    regularMarketDayLow: dayLow,
    closeCount: closes.length,
    smaFastWindow: fast?.window,
    smaSlowWindow: slow?.window,
    exchangeTimezoneName:
      dailyResult.meta?.exchangeTimezoneName ?? intradayResult?.meta?.exchangeTimezoneName,
  };
}

function quoteLastPrint(row: QuoteResult): LastPrint | null {
  const post = row.postMarketPrice;
  const postTime = row.postMarketTime;
  const regular = row.regularMarketPrice;
  const regularTime = row.regularMarketTime;
  const pre = row.preMarketPrice;
  const preTime = row.preMarketTime;

  if (
    post != null &&
    Number.isFinite(post) &&
    post > 0 &&
    postTime != null &&
    (regularTime == null || postTime > regularTime)
  ) {
    return { price: post, time: postTime, field: "quote" };
  }
  if (regular != null && Number.isFinite(regular) && regular > 0) {
    return { price: regular, time: regularTime, field: "quote" };
  }
  if (pre != null && Number.isFinite(pre) && pre > 0) {
    return { price: pre, time: preTime, field: "quote" };
  }
  return null;
}

function yahooQuoteFromRow(row: QuoteResult, fallbackSymbol: string): YahooQuote | null {
  const picked = quoteLastPrint(row);
  if (!picked) return null;
  return {
    symbol: row.symbol ?? fallbackSymbol,
    regularMarketPrice: picked.price,
    bid: row.bid,
    ask: row.ask,
    regularMarketChangePercent: row.regularMarketChangePercent,
    regularMarketChange: row.regularMarketChange,
    previousClose: row.regularMarketPreviousClose,
    regularMarketTime: picked.time,
    fiftyDayAverage: row.fiftyDayAverage,
    twoHundredDayAverage: row.twoHundredDayAverage,
    regularMarketDayHigh: row.regularMarketDayHigh,
    regularMarketDayLow: row.regularMarketDayLow,
    closeCount: 0,
  };
}

function rememberQuote(map: Map<string, YahooQuote>, requested: string, quote: YahooQuote) {
  map.set(requested, quote);
  if (quote.symbol) map.set(quote.symbol, quote);
}

async function fetchQuoteSnapshots(symbols: string[]): Promise<Map<string, YahooQuote>> {
  const map = new Map<string, YahooQuote>();
  if (symbols.length === 0) return map;
  const batches = chunk(symbols, QUOTE_BATCH);
  await Promise.all(
    batches.map(async (batch) => {
      const url = `${env.marketDataBaseUrl}/v7/finance/quote?symbols=${batch.map(encodeURIComponent).join(",")}`;
      const res = await yahooFetch(url);
      if (!res?.ok) {
        if (res && res.status !== 401 && res.status !== 404) {
          console.info("[arcverdict:last]", { quoteStatus: res.status, batch: batch.length });
        }
        return;
      }
      try {
        const json = (await res.json()) as QuoteResponse;
        const rows = json.quoteResponse?.result ?? [];
        const bySymbol = new Map(rows.filter((row) => row.symbol).map((row) => [row.symbol as string, row]));
        for (const requested of batch) {
          const row = bySymbol.get(requested) ?? rows.find((r) => r.symbol === requested);
          if (!row) continue;
          const quote = yahooQuoteFromRow(row, requested);
          if (quote) rememberQuote(map, requested, quote);
        }
      } catch {
        return;
      }
    }),
  );
  return map;
}

async function fetchQuoteSnapshot(symbol: string): Promise<YahooQuote | null> {
  const map = await fetchQuoteSnapshots([symbol]);
  return map.get(symbol) ?? null;
}

async function fetchQuotePrice(symbol: string): Promise<number | null> {
  const snap = await fetchQuoteSnapshot(symbol);
  return snap?.regularMarketPrice ?? null;
}

function rememberUsdInr(rate: number): UsdInrQuote {
  cachedUsdInr = { rate, at: Date.now() };
  return { rate, source: "live" };
}

function cachedUsdInrQuote(): UsdInrQuote | null {
  if (!cachedUsdInr) return null;
  if (Date.now() - cachedUsdInr.at > USDINR_CACHE_MS) return null;
  return { rate: cachedUsdInr.rate, source: "cached" };
}

/** USDINR is fetched outside the metals/ETF pool so a 429 on FX does not blank INR levels.
 *  Warm FX cache is reused so COMEX last is not delayed by extra chart calls. */
export async function fetchUsdInr(): Promise<UsdInrQuote | null> {
  const cached = cachedUsdInrQuote();
  if (cached) return cached;
  for (const symbol of USDINR_SYMBOLS) {
    const q = await fetchChart(symbol, { smaFast: 5, smaSlow: 20 });
    const px = q?.regularMarketPrice;
    if (px != null && px > 0) return rememberUsdInr(px);
  }
  for (const symbol of USDINR_SYMBOLS) {
    const px = await fetchQuotePrice(symbol);
    if (px != null) return rememberUsdInr(px);
  }
  return null;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

function yahooQuoteFromSpark(
  symbol: string,
  result: ChartResult,
  periods: { smaFast: number; smaSlow: number },
): YahooQuote | null {
  const rawClose = result.indicators?.quote?.[0]?.close ?? [];
  const adjClose = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const useAdj = !rawClose.some((v) => v != null);
  const closeSeries = useAdj ? adjClose : rawClose;
  const closes = numericSeries(closeSeries);
  const daily = lastBar(closeSeries, result.timestamp);
  const meta = result.meta;
  const gmtOffset = meta?.gmtoffset ?? 0;
  const picked = pickLastPrint({
    daily,
    intraday: null,
    metaPrice: meta?.regularMarketPrice,
    metaTime: meta?.regularMarketTime,
    gmtOffset,
    barSec: BAR_SEC_5M,
  });
  if (!picked) return null;

  const sameSession = sameExchangeDay(daily?.time, picked.time, gmtOffset);
  const prevClose = firstPositive([
    sameSession && closes.length >= 2 ? closes[closes.length - 2] : undefined,
    !sameSession && closes.length >= 1 ? closes[closes.length - 1] : undefined,
    meta?.previousClose,
    meta?.regularMarketPreviousClose,
  ]);
  const change = prevClose != null ? picked.price - prevClose : meta?.regularMarketChange;
  const changePct =
    change != null && prevClose != null && prevClose !== 0 ? (change / prevClose) * 100 : meta?.regularMarketChangePercent;
  const fast = smaWithWindow(closes, periods.smaFast);
  const slow = smaWithWindow(closes, periods.smaSlow);
  const highs = result.indicators?.quote?.[0]?.high ?? [];
  const lows = result.indicators?.quote?.[0]?.low ?? [];
  const lastHigh = [...highs].reverse().find((v) => v != null);
  const lastLow = [...lows].reverse().find((v) => v != null);

  return {
    symbol,
    regularMarketPrice: picked.price,
    bid: meta?.bid,
    ask: meta?.ask,
    regularMarketChangePercent: changePct,
    regularMarketChange: change,
    previousClose: prevClose,
    regularMarketTime: picked.time,
    fiftyDayAverage: fast?.value ?? meta?.fiftyDayAverage,
    twoHundredDayAverage: slow?.value ?? meta?.twoHundredDayAverage,
    regularMarketDayHigh: firstPositive([meta?.regularMarketDayHigh, lastHigh]),
    regularMarketDayLow: firstPositive([meta?.regularMarketDayLow, lastLow]),
    closeCount: closes.length,
    smaFastWindow: fast?.window,
    smaSlowWindow: slow?.window,
    exchangeTimezoneName: meta?.exchangeTimezoneName,
  };
}

async function fetchSparkBatch(
  symbols: string[],
  periods: { smaFast: number; smaSlow: number },
  range: string,
): Promise<Map<string, YahooQuote>> {
  const map = new Map<string, YahooQuote>();
  const url = `${env.marketDataBaseUrl}/v7/finance/spark?symbols=${symbols.map(encodeURIComponent).join(",")}&range=${range}&interval=1d`;
  const res = await yahooFetch(url);
  if (!res?.ok) return map;
  try {
    const json = (await res.json()) as SparkResponse;
    for (const row of json.spark?.result ?? []) {
      const result = row.response?.[0];
      const symbol = row.symbol ?? result?.meta?.symbol;
      if (!symbol || !result) continue;
      const quote = yahooQuoteFromSpark(symbol, result, periods);
      if (!quote) continue;
      map.set(symbol, quote);
    }
  } catch {
    return map;
  }
  return map;
}

async function fetchSparkQuotes(
  symbols: string[],
  periods: { smaFast: number; smaSlow: number },
): Promise<YahooQuote[]> {
  const range = periods.smaSlow > 220 ? "2y" : "1y";
  const maps = await Promise.all(chunk(symbols, SPARK_BATCH).map((batch) => fetchSparkBatch(batch, periods, range)));
  const bySymbol = new Map<string, YahooQuote>();
  for (const map of maps) {
    for (const [symbol, quote] of map) bySymbol.set(symbol, quote);
  }
  return symbols.map((symbol) => bySymbol.get(symbol)).filter((row): row is YahooQuote => row != null);
}

export async function fetchYahooQuotes(
  symbols: string[],
  periods = { smaFast: 50, smaSlow: 200 },
  opts: QuoteFetchOptions = {},
): Promise<YahooQuote[]> {
  if (opts.prefer1m) {
    const rows = await mapPool(symbols, env.scanConcurrency, (symbol) => fetchChart(symbol, periods, opts));
    return rows.filter((row): row is YahooQuote => row != null);
  }

  const started = Date.now();
  let quotes = await fetchSparkQuotes(symbols, periods);
  let path: "spark" | "chart" = "spark";

  if (quotes.length === 0) {
    path = "chart";
    const rows = await mapPool(symbols, env.scanConcurrency, async (symbol) => {
      if (Date.now() - started > SCAN_BUDGET_MS) return null;
      return fetchChart(symbol, periods, opts);
    });
    quotes = rows.filter((row): row is YahooQuote => row != null);
  }

  console.info("[arcverdict:quotes]", {
    requested: symbols.length,
    quoted: quotes.length,
    ms: Date.now() - started,
    path,
  });
  return quotes;
}

export function quoteBySymbol(quotes: YahooQuote[], symbol: string) {
  return quotes.find((q) => q.symbol === symbol) ?? null;
}

export function nseSymbol(ticker: string) {
  return `${ticker}.NS`;
}
