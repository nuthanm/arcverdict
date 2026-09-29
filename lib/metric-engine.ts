import type { DailyBar } from "./daily-history";

export type MetricRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  priceChange: number;
  transactionValue: number;
  normalizedTransactionValue: number;
  runningSum: number;
  runningSumAverage: number;
  runningSumPercentile: number;
  slope15: number;
  slope10: number;
  slope5: number;
  slopeStrength: number;
  consistency: number;
  acceleration: number;
  rsi: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  adx: number | null;
  atrPct: number | null;
  bbPosition: number | null;
  volumeParticipation: number | null;
  trend: string;
  trendScore: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function linregSlope(values: number[]) {
  const n = values.length;
  if (n < 2) return 0;
  const xbar = (n - 1) / 2;
  const ybar = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xbar) * (values[i] - ybar);
    den += (i - xbar) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function rollingMean(values: number[], index: number, window: number) {
  const start = Math.max(0, index - window + 1);
  return mean(values.slice(start, index + 1));
}

function percentileAtMost(values: number[], index: number, window: number) {
  const start = Math.max(0, index - window + 1);
  const slice = values.slice(start, index + 1);
  const current = values[index];
  return (100 * slice.filter((value) => value <= current).length) / slice.length;
}

function slopeAt(values: number[], index: number, window: number) {
  if (index + 1 < window) return 0;
  return linregSlope(values.slice(index - window + 1, index + 1));
}

function emaAt(values: number[], period: number) {
  const out: Array<number | null> = [];
  let prev: number | null = null;
  const k = 2 / (period + 1);
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < period) {
      out.push(null);
      continue;
    }
    if (prev == null) prev = mean(values.slice(i - period + 1, i + 1));
    else prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function wilderRsi(closes: number[], period = 14) {
  const out: Array<number | null> = Array(closes.length).fill(null);
  let avgGain: number | null = null;
  let avgLoss: number | null = null;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i < period) {
      gainSum += gain;
      lossSum += loss;
      continue;
    }
    if (i === period) {
      gainSum += gain;
      lossSum += loss;
      avgGain = gainSum / period;
      avgLoss = lossSum / period;
    } else if (avgGain != null && avgLoss != null) {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (avgGain == null || avgLoss == null) continue;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function sampleStdev(values: number[]) {
  const mid = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - mid) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function wilderAdx(bars: DailyBar[], period = 14) {
  const atrPct: Array<number | null> = Array(bars.length).fill(null);
  const adx: Array<number | null> = Array(bars.length).fill(null);
  let atr: number | null = null;
  let plusDm: number | null = null;
  let minusDm: number | null = null;
  let adxSmooth: number | null = null;
  const dxSeed: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    const plus = up > down && up > 0 ? up : 0;
    const minus = down > up && down > 0 ? down : 0;
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
    if (i < period) continue;
    if (i === period) {
      let trSum = 0;
      let plusSum = 0;
      let minusSum = 0;
      for (let j = 1; j <= period; j++) {
        const upMove = bars[j].high - bars[j - 1].high;
        const downMove = bars[j - 1].low - bars[j].low;
        plusSum += upMove > downMove && upMove > 0 ? upMove : 0;
        minusSum += downMove > upMove && downMove > 0 ? downMove : 0;
        trSum += Math.max(
          bars[j].high - bars[j].low,
          Math.abs(bars[j].high - bars[j - 1].close),
          Math.abs(bars[j].low - bars[j - 1].close),
        );
      }
      atr = trSum / period;
      plusDm = plusSum / period;
      minusDm = minusSum / period;
    } else if (atr != null && plusDm != null && minusDm != null) {
      atr = (atr * (period - 1) + tr) / period;
      plusDm = (plusDm * (period - 1) + plus) / period;
      minusDm = (minusDm * (period - 1) + minus) / period;
    }
    if (atr == null || plusDm == null || minusDm == null || atr === 0) continue;
    atrPct[i] = (atr / bars[i].close) * 100;
    const plusDi = (100 * plusDm) / atr;
    const minusDi = (100 * minusDm) / atr;
    const dx = plusDi + minusDi === 0 ? 0 : (100 * Math.abs(plusDi - minusDi)) / (plusDi + minusDi);
    if (adxSmooth == null) {
      dxSeed.push(dx);
      if (dxSeed.length === period) adxSmooth = mean(dxSeed);
    } else {
      adxSmooth = (adxSmooth * (period - 1) + dx) / period;
    }
    adx[i] = adxSmooth;
  }
  return { atrPct, adx };
}

function trendLabel(percentile: number, slope5: number, slope15: number) {
  const up = slope5 > 0 && slope15 >= 0;
  const down = slope5 < 0 && slope15 <= 0;
  if (percentile >= 80 && up) return { trend: "Very Strong Accumulation", trendScore: 100 };
  if (percentile >= 60 && up) return { trend: "Strong Accumulation", trendScore: 85 };
  if (down && percentile <= 20) return { trend: "Very Strong Distribution", trendScore: 10 };
  if (down && percentile <= 40) return { trend: "Strong Distribution", trendScore: 25 };
  if (slope5 < slope15) return { trend: "Momentum Cooling", trendScore: 70 };
  return { trend: "Trend Weakening", trendScore: 55 };
}

export function buildMetrics(bars: DailyBar[]): MetricRow[] {
  const closes = bars.map((bar) => bar.close);
  const volumes = bars.map((bar) => bar.volume);
  const priceChanges = bars.map((bar) => bar.close - bar.open);
  const transactionValues = priceChanges.map((change, i) => (change * volumes[i]) / 1e7);
  const normalized = transactionValues.map((value) => round2(Math.sign(value) * Math.log1p(Math.abs(value))));
  const runningSums: number[] = [];
  let running = 0;
  for (const value of normalized) {
    running += value;
    runningSums.push(running);
  }
  const rsi = wilderRsi(closes);
  const ema20 = emaAt(closes, 20);
  const ema50 = emaAt(closes, 50);
  const ema200 = emaAt(closes, 200);
  const { atrPct, adx } = wilderAdx(bars);

  return bars.map((bar, i) => {
    const slope15 = slopeAt(runningSums, i, 15);
    const slope10 = slopeAt(runningSums, i, 10);
    const slope5 = slopeAt(runningSums, i, 5);
    const runningSumAverage = rollingMean(runningSums, i, 30);
    const runningSumPercentile = percentileAtMost(runningSums.map((_, index) => rollingMean(runningSums, index, 30)), i, 15);
    const consistencyWindow = normalized.slice(Math.max(0, i - 13), i + 1);
    const consistency = (100 * consistencyWindow.filter((value) => value > 0).length) / consistencyWindow.length;
    const label = trendLabel(runningSumPercentile, slope5, slope15);
    let bbPosition: number | null = null;
    if (i >= 19) {
      const window = closes.slice(i - 19, i + 1);
      const mid = mean(window);
      const sd = sampleStdev(window);
      const upper = mid + 2 * sd;
      const lower = mid - 2 * sd;
      bbPosition = upper === lower ? null : (bar.close - lower) / (upper - lower);
    }
    const volumeWindow = volumes.slice(Math.max(0, i - 19), i + 1);
    const volumeParticipation = volumeWindow.length >= 20 ? bar.volume / mean(volumeWindow) : null;
    return {
      date: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      priceChange: priceChanges[i],
      transactionValue: transactionValues[i],
      normalizedTransactionValue: normalized[i],
      runningSum: runningSums[i],
      runningSumAverage,
      runningSumPercentile,
      slope15,
      slope10,
      slope5,
      slopeStrength: Math.abs(slope15) + Math.abs(slope10) + Math.abs(slope5),
      consistency,
      acceleration: slope5 - slope15,
      rsi: rsi[i],
      ema20: ema20[i],
      ema50: ema50[i],
      ema200: ema200[i],
      adx: adx[i],
      atrPct: atrPct[i],
      bbPosition,
      volumeParticipation,
      trend: label.trend,
      trendScore: label.trendScore,
    };
  });
}
