import type { HourBar } from "./daily-history";

const EMA_PERIOD = 50;
const EMA_SLOPE_BARS = 5;
/** Pullback low must reach the rising average without knifing through it. */
const TAG_ABOVE = 1.0035;
const TAG_BELOW = 0.995;

export function isUptrend(trend: string | null) {
  return trend === "Strong Accumulation" || trend === "Very Strong Accumulation";
}

export type SessionReversal =
  | {
      state: "confirmed";
      entryPrice: number;
      supportPrice: number;
      confirmLabel: string;
      probeIndex: number;
      confirmIndex: number;
    }
  | { state: "none" };

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function ema(closes: number[]) {
  const out: Array<number | null> = Array(closes.length).fill(null);
  if (closes.length < EMA_PERIOD) return out;
  let seed = 0;
  for (let i = 0; i < EMA_PERIOD; i++) seed += closes[i];
  let prev = seed / EMA_PERIOD;
  out[EMA_PERIOD - 1] = prev;
  const k = 2 / (EMA_PERIOD + 1);
  for (let i = EMA_PERIOD; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** NSE stamps are IST, which is a fixed offset from UTC. */
function barStartMs(date: string, label: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = label.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) - 5.5 * 60 * 60 * 1000;
}

const BAR_MS = 30 * 60 * 1000;

function completed(bar: HourBar, now: Date) {
  const start = barStartMs(bar.date, bar.label);
  const [hour, minute] = bar.label.split(":").map(Number);
  const cashLeft = 15 * 60 + 30 - (hour * 60 + minute);
  const span = cashLeft > 0 && cashLeft < 30 ? cashLeft * 60 * 1000 : BAR_MS;
  return now.getTime() >= start + span;
}

function upperHalf(bar: HourBar) {
  const range = bar.high - bar.low;
  if (!(range > 0)) return false;
  return (bar.close - bar.low) / range >= 0.5;
}

function lowerHalf(bar: HourBar) {
  const range = bar.high - bar.low;
  if (!(range > 0)) return false;
  return (bar.close - bar.low) / range <= 0.5;
}

function participated(bars: HourBar[], index: number) {
  const start = Math.max(0, index - 10);
  let sum = 0;
  let count = 0;
  for (let i = start; i < index; i++) {
    sum += bars[i].volume;
    count += 1;
  }
  if (!count || sum <= 0) return true;
  return bars[index].volume >= sum / count;
}

function rising(averages: Array<number | null>, index: number) {
  const current = averages[index];
  const prior = index >= EMA_SLOPE_BARS ? averages[index - EMA_SLOPE_BARS] : null;
  return current != null && prior != null && current > prior;
}

function falling(averages: Array<number | null>, index: number) {
  const current = averages[index];
  const prior = index >= EMA_SLOPE_BARS ? averages[index - EMA_SLOPE_BARS] : null;
  return current != null && prior != null && current < prior;
}

function heldAbove(session: Array<{ bar: HourBar; index: number }>, averages: Array<number | null>, beforeIndex: number, now: Date) {
  return session.every((item) => {
    if (item.index >= beforeIndex || !completed(item.bar, now)) return true;
    const average = averages[item.index];
    return average == null || item.bar.close > average;
  });
}

/**
 * Buy only inside a 30-minute uptrend. The 50-bar EMA must be rising, every
 * earlier completed bar of the session must have closed above it, and the
 * buy is the first pullback that tags that average and then resumes.
 * Entry is the pullback bar's high. The next completed bar has to trade
 * through it and close back above the average.
 */
export function findUptrendBuy(bars: HourBar[], sessionDate: string, now: Date): SessionReversal {
  if (bars.length < EMA_PERIOD + EMA_SLOPE_BARS) return { state: "none" };
  const averages = ema(bars.map((bar) => bar.close));
  const session = bars
    .map((bar, index) => ({ bar, index }))
    .filter(({ bar }) => bar.date === sessionDate && bar.label !== "15:30");
  if (session.length < 2) return { state: "none" };

  for (const probe of session) {
    if (!completed(probe.bar, now)) continue;
    const average = averages[probe.index];
    if (average == null || !rising(averages, probe.index)) continue;
    if (!heldAbove(session, averages, probe.index, now)) return { state: "none" };
    const tagged = probe.bar.low <= average * TAG_ABOVE && probe.bar.low >= average * TAG_BELOW && probe.bar.close > average;
    if (!tagged) continue;
    const confirm = session.find((item) => {
      const confirmAverage = averages[item.index];
      return (
        item.index > probe.index &&
        completed(item.bar, now) &&
        confirmAverage != null &&
        rising(averages, item.index) &&
        item.bar.close > probe.bar.high &&
        item.bar.close > confirmAverage &&
        item.bar.close > item.bar.open &&
        upperHalf(item.bar) &&
        participated(bars, item.index)
      );
    });
    if (!confirm) continue;
    const entryPrice = confirm.bar.low > probe.bar.high ? round2(confirm.bar.open) : round2(probe.bar.high);
    return {
      state: "confirmed",
      entryPrice,
      supportPrice: round2(probe.bar.low),
      confirmLabel: confirm.bar.label,
      probeIndex: probe.index,
      confirmIndex: confirm.index,
    };
  }
  return { state: "none" };
}

function afterBuy(bar: HourBar, sessionDate: string, afterLabel: string) {
  if (bar.label === "15:30") return false;
  return barStartMs(bar.date, bar.label) > barStartMs(sessionDate, afterLabel);
}

function downBreak(bar: HourBar, average: number) {
  return bar.close < average && bar.close < bar.open && lowerHalf(bar);
}

/**
 * Sell only when a downtrend breaks the same 50-bar EMA used for the buy.
 * One close under a still-rising average is a dip and does not sell.
 * The average must be falling, a completed 30-minute bar must close through it,
 * and a later completed bar must close through it again with a lower high and a
 * lower close. Any close back above the average before that cancels the break.
 * The sell value is the 50-bar EMA on the bar that broke it.
 */
export function findDowntrendSell(
  bars: HourBar[],
  sessionDate: string,
  afterLabel: string,
  now: Date,
): { sellPrice: number; soldOn: string } | null {
  if (bars.length < EMA_PERIOD + EMA_SLOPE_BARS) return null;
  const averages = ema(bars.map((bar) => bar.close));
  const candidates = bars
    .map((bar, index) => ({ bar, index }))
    .filter(({ bar }) => afterBuy(bar, sessionDate, afterLabel));

  for (let i = 0; i < candidates.length; i++) {
    const probe = candidates[i];
    if (!completed(probe.bar, now)) continue;
    const average = averages[probe.index];
    if (average == null || !falling(averages, probe.index) || !downBreak(probe.bar, average)) continue;

    for (let j = i + 1; j < candidates.length; j++) {
      const next = candidates[j];
      if (!completed(next.bar, now)) break;
      const nextAverage = averages[next.index];
      if (nextAverage == null || next.bar.close >= nextAverage || !falling(averages, next.index)) break;
      if (next.bar.high >= probe.bar.high) break;
      const confirmed =
        next.bar.close < probe.bar.close && downBreak(next.bar, nextAverage) && participated(bars, next.index);
      if (!confirmed) continue;
      return { sellPrice: round2(average), soldOn: next.bar.date };
    }
  }
  return null;
}
