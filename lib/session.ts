import type { SessionInfo } from "./types";

function partsInZone(timeZone: "Asia/Kolkata" | "America/Chicago", now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const map = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const weekday = map.weekday;
  const minutes = Number(map.hour) * 60 + Number(map.minute);
  const ymd = `${map.year}-${map.month}-${map.day}`;
  return { weekday, minutes, map, ymd };
}

function isNseWeekday(weekday: string) {
  return weekday !== "Sat" && weekday !== "Sun";
}

function formatStamp(now: Date, timeZone: "Asia/Kolkata" | "America/Chicago", suffix: string) {
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(now) + ` ${suffix}`
  );
}

function nextNseWeekdayOpen(now: Date, openMinutes: number) {
  const cursor = new Date(now.getTime());
  for (let i = 0; i < 8; i++) {
    const probe = new Date(cursor.getTime() + i * 24 * 60 * 60 * 1000);
    const { weekday, minutes, ymd } = partsInZone("Asia/Kolkata", probe);
    if (!isNseWeekday(weekday)) continue;
    if (i === 0 && minutes >= openMinutes) continue;
    const hour = String(Math.floor(openMinutes / 60)).padStart(2, "0");
    const min = String(openMinutes % 60).padStart(2, "0");
    return `${ymd} ${hour}:${min} IST`;
  }
  return null;
}

/** CME Globex metals (GC/SI/HG): Sun 17:00–Fri 16:00 CT, daily halt 16:00–17:00 CT. Independent of NSE. */
function isComexOpenAt(now: Date) {
  const { weekday, minutes } = partsInZone("America/Chicago", now);
  const haltStart = 16 * 60;
  const haltEnd = 17 * 60;
  if (weekday === "Sat") return false;
  if (weekday === "Sun") return minutes >= haltEnd;
  if (weekday === "Fri") return minutes < haltStart;
  return minutes < haltStart || minutes >= haltEnd;
}

function nextComexOpen(now: Date) {
  const { weekday, minutes, ymd } = partsInZone("America/Chicago", now);
  const haltStart = 16 * 60;
  const haltEnd = 17 * 60;
  const stamp = (day: string) => `${day} 17:00 CT`;

  if (weekday !== "Sat" && weekday !== "Fri" && weekday !== "Sun" && minutes >= haltStart && minutes < haltEnd) {
    return stamp(ymd);
  }
  if (weekday === "Sun" && minutes < haltEnd) {
    return stamp(ymd);
  }

  for (let i = 1; i <= 8; i++) {
    const probe = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const p = partsInZone("America/Chicago", probe);
    if (p.weekday === "Sun") return stamp(p.ymd);
  }
  return null;
}

export function nseSession(now = new Date()): SessionInfo {
  const { weekday, minutes } = partsInZone("Asia/Kolkata", now);
  const open = isNseWeekday(weekday) && minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 30;
  return {
    market: "NSE",
    open,
    label: open ? "NSE India equity session is open." : "NSE India equity session is closed.",
    hours: "Monday–Friday, 9:15 am – 3:30 pm IST.",
    timezone: "Asia/Kolkata",
    nextOpen: open ? null : nextNseWeekdayOpen(now, 9 * 60 + 15),
  };
}

export function comexSession(now = new Date()): SessionInfo {
  const open = isComexOpenAt(now);
  return {
    market: "COMEX",
    open,
    label: open ? "US metals futures session is open." : "US metals futures session is closed.",
    hours: "Sunday 5:00 pm – Friday 4:00 pm Chicago time. Daily pause 4–5 pm.",
    timezone: "America/Chicago",
    nextOpen: open ? null : nextComexOpen(now),
  };
}

/** @deprecated Metals follow COMEX Globex, not MCX IST hours. */
export function mcxSession(now = new Date()): SessionInfo {
  return comexSession(now);
}

export function formatIst(now = new Date()) {
  return formatStamp(now, "Asia/Kolkata", "IST");
}

export function formatCt(now = new Date()) {
  return formatStamp(now, "America/Chicago", "CT");
}

/** Turn a snapshot stamp into “Prices as of …”, including leftover 24-hour clocks. */
export function pricesAsOf(runAt: string) {
  if (/\d{1,2}:\d{2}\s*[ap]m/i.test(runAt)) return `Prices as of ${runAt}`;
  const friendly = runAt.replace(/(\d{1,2}):(\d{2})\s*(IST|CT)\b/i, (_, hour, minute, zone) => {
    const h = Number(hour);
    const suffix = h >= 12 ? "pm" : "am";
    return `${h % 12 || 12}:${minute} ${suffix} ${zone.toUpperCase()}`;
  });
  return `Prices as of ${friendly}`;
}

export function metalSessionLabel(code: "gold" | "silver" | "copper", open: boolean) {
  const name =
    code === "gold" ? "US gold futures session" : code === "silver" ? "US silver futures session" : "US copper futures session";
  return open ? `${name} is open.` : `${name} is closed.`;
}
