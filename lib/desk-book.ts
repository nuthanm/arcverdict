import type { DailyLifecycleRow } from "./lifecycle";

export type DeskStatus = "HOLD" | "SELL";

export type DeskLead = {
  company: string;
  signalDate: string;
  leadFor: string;
  close: number | null;
  trend: string | null;
  healthState: string | null;
  pressure: string | null;
  structureState: string | null;
};

export type DeskOpen = {
  company: string;
  signalDate: string;
  boughtOn: string;
  entryClose: number | null;
  lastDate: string;
  lastClose: number | null;
  trend: string | null;
  status: DeskStatus;
  statusNote: string;
};

export type DeskClosed = {
  company: string;
  signalDate: string;
  boughtOn: string;
  entryClose: number | null;
  exitDate: string;
  exitClose: number | null;
  trend: string | null;
  reason: string;
};

export type DeskBook = {
  asOf: string | null;
  closedThrough: string;
  awaitingClose: boolean;
  marketOpen: boolean;
  leads: DeskLead[];
  open: DeskOpen[];
  closed: DeskClosed[];
};

/** Leads on this close are the first book. Earlier reversal trades stay out of tables 2 and 3. */
export const FRESH_FROM = "2026-09-29";

type Day = DailyLifecycleRow & { date: string };

function istParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    ymd: `${map.year}-${map.month}-${map.day}`,
    minutes: Number(map.hour) * 60 + Number(map.minute),
    weekday: map.weekday,
  };
}

function previousWeekday(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  do {
    date.setUTCDate(date.getUTCDate() - 1);
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}

export function nextWeekday(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}

/** Cash close is 15:30 IST. Both NSE block-deal windows finish before that. */
export function lastClosedNseSession(now = new Date()) {
  const { ymd, minutes, weekday } = istParts(now);
  if (weekday === "Sat" || weekday === "Sun") return previousWeekday(ymd);
  if (minutes >= 15 * 60 + 30) return ymd;
  return previousWeekday(ymd);
}

export function leadSessionOpen(iso: string, now = new Date()) {
  const { ymd, minutes, weekday } = istParts(now);
  if (ymd > iso) return true;
  if (ymd < iso) return false;
  if (weekday === "Sat" || weekday === "Sun") return false;
  return minutes >= 9 * 60 + 15;
}

/** The lead session has finished. An unconfirmed name should not stay on the book. */
export function leadSessionClosed(iso: string, now = new Date()) {
  const { ymd, minutes, weekday } = istParts(now);
  if (ymd > iso) return true;
  if (ymd < iso) return false;
  if (weekday === "Sat" || weekday === "Sun") return false;
  return minutes >= 15 * 60 + 30;
}

function isUp(trend: string | null) {
  return trend === "Very Strong Accumulation" || trend === "Strong Accumulation";
}

function isDown(trend: string | null) {
  return trend === "Very Strong Distribution" || trend === "Strong Distribution";
}

/** Workbook R1 entry, and the trend has just turned from non-uptrend into accumulation. */
function reversalBuy(day: Day, prev: Day | null) {
  if (!prev) return false;
  if (day.suggestion !== "POTENTIAL ENTRY") return false;
  if (!isUp(day.trend)) return false;
  if (isUp(prev.trend)) return false;
  return true;
}

function sellConfirmedDay(day: Day) {
  if (day.decayStatus === "CONFIRMED" || day.suggestion === "CAUTION TO EXIT") {
    return "Confirmed exit — deterioration held for three sessions";
  }
  if (isDown(day.trend)) return "Reversal downtrend confirmed";
  return null;
}

export function positionStatus(day: Day): { status: DeskStatus; statusNote: string } {
  if (isUp(day.trend)) return { status: "HOLD", statusNote: "Hold — positive trend" };
  if (day.suggestion?.startsWith("CAUTION") || day.pressure === "Cooling" || day.structureState !== "Structure Stable") {
    return { status: "SELL", statusNote: "Sell — reversal downtrend is hitting" };
  }
  return { status: "HOLD", statusNote: "Hold — positive trend" };
}

function closedDays(rows: DailyLifecycleRow[], closedThrough: string): Day[] {
  return rows
    .filter((row): row is Day => row.date != null && row.date <= closedThrough)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type FreshLead = DeskLead & {
  sessionOpen: boolean;
};

/** Latest reversal buy on or after the fresh-start close. Earlier signals are ignored. */
export function freshReversalLeads(
  history: Record<string, DailyLifecycleRow[]>,
  now = new Date(),
): { asOf: string | null; closedThrough: string; marketOpen: boolean; awaitingClose: boolean; leads: FreshLead[] } {
  const closedThrough = lastClosedNseSession(now);
  const clock = istParts(now);
  const marketOpen =
    clock.weekday !== "Sat" &&
    clock.weekday !== "Sun" &&
    clock.minutes >= 9 * 60 + 15 &&
    clock.minutes < 15 * 60 + 30;
  const awaitingClose = marketOpen;
  const leads: FreshLead[] = [];

  for (const [company, rows] of Object.entries(history)) {
    const days = closedDays(rows, closedThrough);
    let signal: Day | null = null;
    for (let i = 1; i < days.length; i++) {
      if (days[i].date < FRESH_FROM) continue;
      if (reversalBuy(days[i], days[i - 1])) signal = days[i];
    }
    if (!signal) continue;
    const leadFor = nextWeekday(signal.date);
    leads.push({
      company,
      signalDate: signal.date,
      leadFor,
      close: signal.close,
      trend: signal.trend,
      healthState: signal.healthState,
      pressure: signal.pressure,
      structureState: signal.structureState,
      sessionOpen: leadSessionOpen(leadFor, now),
    });
  }

  leads.sort((a, b) => a.company.localeCompare(b.company));
  return { asOf: null, closedThrough, marketOpen, awaitingClose, leads };
}

/** First confirmed sell on a session after the signal close. */
export function sellAfterSignal(rows: DailyLifecycleRow[], signalDate: string, closedThrough: string) {
  const days = closedDays(rows, closedThrough).filter((day) => day.date > signalDate);
  for (const day of days) {
    const reason = sellConfirmedDay(day);
    if (reason && day.close != null) {
      return {
        sell: { exitDate: day.date, exitClose: day.close, reason, trend: day.trend },
        last: day,
      };
    }
  }
  return { sell: null, last: days.length ? days[days.length - 1] : null };
}
