import type { Action } from "./types";

/** Weights for the live structural score. Documented in the Conviction tooltip. */
export const CONVICTION_WEIGHTS = {
  base: 50,
  priceAboveFast: 15,
  fastAboveSlow: 15,
  buyNotExtended: 12,
  sellOrDowntrend: 18,
  extendedPct: 0.035,
} as const;

export function classify(params: {
  last: number | null;
  smaFast: number | null;
  smaSlow: number | null;
  dayHigh?: number | null;
  dayLow?: number | null;
  stopMultiple?: number;
  smaFastPeriod?: number;
  smaSlowPeriod?: number;
  smaFastWindow?: number;
  smaSlowWindow?: number;
  lastMissingWhy?: string;
}): { action: Action; why: string; stop: number | null; conviction: number } {
  const {
    last,
    smaFast,
    smaSlow,
    dayHigh,
    dayLow,
    stopMultiple = 2.1,
    smaFastPeriod = 50,
    smaSlowPeriod = 200,
    smaFastWindow,
    smaSlowWindow,
    lastMissingWhy,
  } = params;

  if (last == null) {
    return {
      action: "NONE",
      why: lastMissingWhy ?? "Last price not in this snapshot.",
      stop: null,
      conviction: 0,
    };
  }

  if (smaFast == null) {
    return {
      action: "WATCH",
      why: `Need more daily closes for ${smaFastPeriod}/${smaSlowPeriod} averages. LTP is shown; wait until the window fills.`,
      stop: protectiveStop(last, dayHigh, dayLow, stopMultiple),
      conviction: 0,
    };
  }

  const stop = protectiveStop(last, dayHigh, dayLow, stopMultiple);
  const vsFast = (last - smaFast) / smaFast;
  const uptrend = smaSlow != null ? last > smaFast && smaFast >= smaSlow : last > smaFast;
  const downtrend = smaSlow != null ? last < smaFast && smaFast <= smaSlow : last < smaFast;

  let action: Action;
  let why: string;
  let publishedStop: number | null;

  if (downtrend && vsFast <= -0.025) {
    action = "SELL";
    why = "Exit. Price is below the fast average in a weakening trend.";
    publishedStop = null;
  } else if (uptrend && vsFast >= -0.015 && vsFast <= 0.035) {
    action = "BUY";
    why = "Enter. Uptrend is intact and price remains near the fast average.";
    publishedStop = stop;
  } else if (uptrend && vsFast > 0.035) {
    action = "HOLD";
    why = "Stay. Trend is higher, but the name is extended — do not add.";
    publishedStop = stop;
  } else if (!uptrend && !downtrend) {
    action = "WATCH";
    why = "Wait. Mixed trend — no live enter or exit fill.";
    publishedStop = stop;
  } else if (downtrend) {
    action = "WATCH";
    why = "Wait. Weak tape, not yet a confirmed exit — no live enter fill.";
    publishedStop = stop;
  } else {
    action = "NONE";
    why = "Skip. No instruction. Absence of a signal is not a short.";
    publishedStop = null;
  }

  return {
    action,
    why: `${why}${historyNote({ smaFastPeriod, smaSlowPeriod, smaFastWindow, smaSlowWindow, smaSlow })}`,
    stop: publishedStop,
    conviction: convictionScore({ last, smaFast, smaSlow, action }),
  };
}

/**
 * Live structural conviction 0–100 from this snapshot.
 * Not a historical win rate and not a guarantee.
 */
export function convictionScore(params: {
  last: number | null;
  smaFast: number | null;
  smaSlow: number | null;
  action: Action;
}): number {
  const { last, smaFast, smaSlow, action } = params;
  if (last == null || smaFast == null) return 0;

  const vsFast = (last - smaFast) / smaFast;
  const extended = vsFast > CONVICTION_WEIGHTS.extendedPct;
  const downtrend = smaSlow != null ? last < smaFast && smaFast <= smaSlow : last < smaFast;

  let score = CONVICTION_WEIGHTS.base;
  if (last > smaFast) score += CONVICTION_WEIGHTS.priceAboveFast;
  if (smaSlow != null && smaFast > smaSlow) score += CONVICTION_WEIGHTS.fastAboveSlow;
  if (action === "BUY" && !extended) score += CONVICTION_WEIGHTS.buyNotExtended;
  if (action === "SELL" || downtrend) score -= CONVICTION_WEIGHTS.sellOrDowntrend;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function protectiveStop(
  last: number,
  dayHigh: number | null | undefined,
  dayLow: number | null | undefined,
  stopMultiple: number,
) {
  const range = dayHigh != null && dayLow != null && dayHigh > dayLow ? dayHigh - dayLow : last * 0.012;
  return round2(last - stopMultiple * range);
}

function historyNote(params: {
  smaFastPeriod: number;
  smaSlowPeriod: number;
  smaFastWindow?: number;
  smaSlowWindow?: number;
  smaSlow: number | null;
}) {
  const { smaFastPeriod, smaSlowPeriod, smaFastWindow, smaSlowWindow, smaSlow } = params;
  const bits: string[] = [];
  if (smaFastWindow != null && smaFastWindow < smaFastPeriod) {
    bits.push(`fast ${smaFastWindow}-day (${smaFastPeriod} not filled)`);
  }
  if (smaSlow == null) {
    bits.push(`slow ${smaSlowPeriod}-day not filled`);
  } else if (smaSlowWindow != null && smaSlowWindow < smaSlowPeriod) {
    bits.push(`slow ${smaSlowWindow}-day (${smaSlowPeriod} not filled)`);
  }
  if (bits.length === 0) return "";
  return ` Classified on ${bits.join("; ")}.`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
