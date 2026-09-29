import { env } from "./env";

export type DailyBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type ChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
};

function utcDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

async function fetchBars(symbol: string): Promise<DailyBar[]> {
  const url = `${env.marketDataBaseUrl}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": env.marketDataUserAgent ?? "Mozilla/5.0",
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as ChartResponse;
  const result = json.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const times = result?.timestamp ?? [];
  if (!quote) return [];
  const bars: DailyBar[] = [];
  for (let i = 0; i < times.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];
    if (
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      volume == null ||
      !(open > 0 && high > 0 && low > 0 && close > 0 && volume >= 0)
    ) {
      continue;
    }
    bars.push({ date: utcDate(times[i]), open, high, low, close, volume });
  }
  bars.sort((a, b) => a.date.localeCompare(b.date));
  return bars;
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

/** Daily NSE bars for Yahoo `.NS` symbols. One year is enough for the lifecycle windows. */
export async function fetchNseDailyHistory(tickers: string[]) {
  const rows = await mapPool(tickers, 8, async (ticker) => {
    try {
      return { ticker, bars: await fetchBars(`${ticker}.NS`) };
    } catch {
      return { ticker, bars: [] as DailyBar[] };
    }
  });
  return rows.filter((row) => row.bars.length >= 30);
}
