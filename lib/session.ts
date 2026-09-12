import type { SessionInfo } from "./types";

function partsInKolkata(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const map = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const weekday = map.weekday;
  const minutes = Number(map.hour) * 60 + Number(map.minute);
  return { weekday, minutes, map };
}

function isWeekday(weekday: string) {
  return weekday !== "Sat" && weekday !== "Sun";
}

function formatStamp(now: Date) {
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now) + " IST"
  );
}

function nextWeekdayOpen(now: Date, openMinutes: number) {
  const cursor = new Date(now.getTime());
  for (let i = 0; i < 8; i++) {
    const probe = new Date(cursor.getTime() + i * 24 * 60 * 60 * 1000);
    const { weekday, minutes } = partsInKolkata(probe);
    if (!isWeekday(weekday)) continue;
    if (i === 0 && minutes >= openMinutes) continue;
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(probe);
    const hour = String(Math.floor(openMinutes / 60)).padStart(2, "0");
    const min = String(openMinutes % 60).padStart(2, "0");
    return `${ymd} ${hour}:${min} IST`;
  }
  return null;
}

export function nseSession(now = new Date()): SessionInfo {
  const { weekday, minutes } = partsInKolkata(now);
  const open = isWeekday(weekday) && minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 30;
  return {
    market: "NSE",
    open,
    label: open ? "NSE open" : "NSE closed",
    hours: "09:15–15:30 IST, Monday–Friday",
    timezone: "Asia/Kolkata",
    nextOpen: open ? null : nextWeekdayOpen(now, 9 * 60 + 15),
  };
}

export function mcxSession(now = new Date()): SessionInfo {
  const { weekday, minutes } = partsInKolkata(now);
  const open = isWeekday(weekday) && minutes >= 9 * 60 && minutes < 23 * 60 + 30;
  return {
    market: "Metals",
    open,
    label: open ? "Metals session open" : "Metals session closed",
    hours: "09:00–23:30 IST, Monday–Friday",
    timezone: "Asia/Kolkata",
    nextOpen: open ? null : nextWeekdayOpen(now, 9 * 60),
  };
}

export function formatIst(now = new Date()) {
  return formatStamp(now);
}
