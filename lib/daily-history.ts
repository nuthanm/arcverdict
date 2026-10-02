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

async function fetchBars(symbol: string, allowMissingClose = false): Promise<DailyBar[]> {
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
    const missingClose = close == null && allowMissingClose && i === times.length - 1;
    const resolvedClose = missingClose ? open : close;
    if (
      open == null ||
      high == null ||
      low == null ||
      resolvedClose == null ||
      volume == null ||
      !(open > 0 && high > 0 && low > 0 && resolvedClose > 0 && volume >= 0)
    ) {
      continue;
    }
    bars.push({ date: utcDate(times[i]), open, high, low, close: resolvedClose, volume });
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

export type HourBar = DailyBar & {
  label: string;
};

const candleCache = new Map<string, { at: number; bars: DailyBar[] }>();
const hourCache = new Map<string, { at: number; bars: HourBar[] }>();
const CANDLE_CACHE_MS = 10 * 60 * 1000;
const HOUR_CACHE_MS = 2 * 60 * 1000;

function istBarStamp(unixSeconds: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(unixSeconds * 1000));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    label: `${map.hour}:${map.minute}`,
  };
}

async function fetchHourBars(symbol: string): Promise<HourBar[]> {
  const url = `${env.marketDataBaseUrl}/v8/finance/chart/${encodeURIComponent(symbol)}?range=60d&interval=30m`;
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
  const bars: HourBar[] = [];
  for (let i = 0; i < times.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];
    const missingClose = close == null && i === times.length - 1;
    const resolvedClose = missingClose ? open : close;
    if (
      open == null ||
      high == null ||
      low == null ||
      resolvedClose == null ||
      volume == null ||
      !(open > 0 && high > 0 && low > 0 && resolvedClose > 0 && volume >= 0)
    ) {
      continue;
    }
    const stamp = istBarStamp(times[i]);
    bars.push({
      date: stamp.date,
      label: stamp.label,
      open,
      high,
      low,
      close: resolvedClose,
      volume,
    });
  }
  bars.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  return bars;
}

/** Recent daily candles for a handful of NSE symbols. Cached so the desk can poll. */
export async function fetchNseCandles(tickers: string[]) {
  const now = Date.now();
  return mapPool(tickers, 4, async (ticker) => {
    const cached = candleCache.get(ticker);
    if (cached && now - cached.at < CANDLE_CACHE_MS) return { ticker, bars: cached.bars };
    try {
      const bars = await fetchBars(`${ticker}.NS`, true);
      candleCache.set(ticker, { at: now, bars });
      return { ticker, bars };
    } catch {
      return { ticker, bars: [] as DailyBar[] };
    }
  });
}

/** 30-minute NSE candles. Cached for two minutes so a full-book scan can repeat while the desk polls. */
export async function fetchNseHourly(tickers: string[]) {
  const now = Date.now();
  return mapPool(tickers, 6, async (ticker) => {
    const cached = hourCache.get(`${ticker}:30m`);
    if (cached && now - cached.at < HOUR_CACHE_MS) return { ticker, bars: cached.bars };
    try {
      const bars = await fetchHourBars(`${ticker}.NS`);
      hourCache.set(`${ticker}:30m`, { at: now, bars });
      return { ticker, bars };
    } catch {
      return { ticker, bars: [] as HourBar[] };
    }
  });
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
