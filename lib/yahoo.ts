import { env } from "./env";

export type YahooQuote = {
  symbol?: string;
  regularMarketPrice?: number;
  bid?: number;
  ask?: number;
  regularMarketChangePercent?: number;
  regularMarketTime?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
};

type ChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
        bid?: number;
        ask?: number;
        currentTradingPeriod?: unknown;
      };
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
        }>;
      };
    }>;
  };
};

function sma(values: number[], n: number): number | undefined {
  if (values.length < n) return undefined;
  let sum = 0;
  for (let i = values.length - n; i < values.length; i++) sum += values[i];
  return sum / n;
}

async function fetchChart(
  symbol: string,
  periods: { smaFast: number; smaSlow: number },
  attempt = 0,
): Promise<YahooQuote | null> {
  const url = `${env.marketDataBaseUrl}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
  const headers: Record<string, string> = {
    "User-Agent": env.marketDataUserAgent ?? "ArcVerdict/1.0",
    Accept: "application/json",
  };
  if (env.marketDataApiKey) {
    headers.Authorization = `Bearer ${env.marketDataApiKey}`;
  }

  const res = await fetch(url, { headers, cache: "no-store" });
  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    return fetchChart(symbol, periods, attempt + 1);
  }
  if (!res.ok) return null;
  const json = (await res.json()) as ChartResponse;
  const result = json.chart?.result?.[0];
  if (!result) return null;
  const closes = (result.indicators?.quote?.[0]?.close ?? []).filter((v): v is number => v != null);
  const highs = result.indicators?.quote?.[0]?.high ?? [];
  const lows = result.indicators?.quote?.[0]?.low ?? [];
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const lastHigh = [...highs].reverse().find((v) => v != null);
  const lastLow = [...lows].reverse().find((v) => v != null);
  const price = result.meta?.regularMarketPrice ?? lastClose;
  if (price == null) return null;
  return {
    symbol: result.meta?.symbol ?? symbol,
    regularMarketPrice: price,
    bid: result.meta?.bid,
    ask: result.meta?.ask,
    regularMarketChangePercent:
      prevClose != null && prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : undefined,
    regularMarketTime: result.meta?.regularMarketTime,
    fiftyDayAverage: sma(closes, periods.smaFast),
    twoHundredDayAverage: sma(closes, periods.smaSlow),
    regularMarketDayHigh: lastHigh ?? undefined,
    regularMarketDayLow: lastLow ?? undefined,
  };
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

export async function fetchYahooQuotes(
  symbols: string[],
  periods = { smaFast: 50, smaSlow: 200 },
): Promise<YahooQuote[]> {
  const rows = await mapPool(symbols, env.scanConcurrency, (symbol) => fetchChart(symbol, periods));
  return rows.filter((row): row is YahooQuote => row != null);
}

export function nseSymbol(ticker: string) {
  return `${ticker}.NS`;
}
