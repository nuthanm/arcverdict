import type { Action } from "./types";

export function classify(params: {
  last: number | null;
  smaFast: number | null;
  smaSlow: number | null;
  dayHigh?: number | null;
  dayLow?: number | null;
  stopMultiple?: number;
}): { action: Action; why: string; stop: number | null } {
  const { last, smaFast, smaSlow, dayHigh, dayLow, stopMultiple = 2.1 } = params;
  if (last == null || smaFast == null) {
    return { action: "NONE", why: "Insufficient history to form an instruction.", stop: null };
  }

  const range =
    dayHigh != null && dayLow != null && dayHigh > dayLow ? dayHigh - dayLow : last * 0.012;
  const stop = round2(last - stopMultiple * range);
  const vsFast = (last - smaFast) / smaFast;
  const uptrend = smaSlow != null ? last > smaFast && smaFast >= smaSlow : last > smaFast;
  const downtrend = smaSlow != null ? last < smaFast && smaFast <= smaSlow : last < smaFast;

  if (downtrend && vsFast <= -0.025) {
    return {
      action: "SELL",
      why: "Exit. Price is below the fast average in a weakening trend.",
      stop: null,
    };
  }

  if (uptrend && vsFast >= -0.015 && vsFast <= 0.035) {
    return {
      action: "BUY",
      why: "Enter. Uptrend is intact and price remains near the fast average.",
      stop,
    };
  }

  if (uptrend && vsFast > 0.035) {
    return {
      action: "HOLD",
      why: "Maintain. Trend is higher, but the name is extended — do not add.",
      stop,
    };
  }

  if (!uptrend && !downtrend) {
    return {
      action: "WATCH",
      why: "No new risk. Mixed trend — wait for confirmation.",
      stop,
    };
  }

  if (downtrend) {
    return {
      action: "WATCH",
      why: "Do not enter. Weak tape, not yet a confirmed exit.",
      stop,
    };
  }

  return {
    action: "NONE",
    why: "No instruction. Absence of a signal is not a short.",
    stop: null,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
