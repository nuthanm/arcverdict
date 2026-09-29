import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchNseDailyHistory } from "./daily-history";
import { buildSymbolLifecycle } from "./lifecycle-engine";
import { clearLifecycleCache, type LifecycleRow } from "./lifecycle";

type Meta = {
  asOf: string | null;
  attemptedFor: string | null;
};

const dataDir = path.join(process.cwd(), "data");
let refreshing: Promise<void> | null = null;

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(dataDir, name), "utf8")) as T;
}

function istSessionDate(now = new Date()) {
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
  const iso = `${map.year}-${map.month}-${map.day}`;
  const minutes = Number(map.hour) * 60 + Number(map.minute);
  const weekend = map.weekday === "Sat" || map.weekday === "Sun";
  if (!weekend && minutes >= 16 * 60) return iso;
  return previousWeekday(iso);
}

function previousWeekday(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  do {
    date.setUTCDate(date.getUTCDate() - 1);
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}

function symbols() {
  const latest = readJson<LifecycleRow[]>("lifecycle-latest.json");
  return latest.map((row) => row.company).filter(Boolean);
}

function cachedMeta(): Meta {
  try {
    return readJson<Meta>("lifecycle-meta.json");
  } catch {
    const latest = readJson<LifecycleRow[]>("lifecycle-latest.json");
    return { asOf: latest.find((row) => row.date)?.date ?? null, attemptedFor: null };
  }
}

async function rebuild() {
  const expected = istSessionDate();
  const meta = cachedMeta();
  if (meta.asOf && meta.asOf >= expected) return;
  if (meta.attemptedFor === expected && meta.asOf) return;

  const universe = symbols();
  const histories = await fetchNseDailyHistory(universe);
  if (histories.length < Math.min(300, universe.length)) return;
  const built = histories.map((history) => buildSymbolLifecycle(history.ticker, history.bars));
  built.sort((a, b) => (a.latest.healthScore ?? 999) - (b.latest.healthScore ?? 999));
  const asOf = built.reduce<string | null>((latest, row) => {
    if (!row.latest.date) return latest;
    if (!latest || row.latest.date > latest) return row.latest.date;
    return latest;
  }, null);
  const daily = Object.fromEntries(built.map((row) => [row.latest.company, row.daily]));
  writeFileSync(path.join(dataDir, "lifecycle-latest.json"), JSON.stringify(built.map((row) => row.latest)));
  writeFileSync(path.join(dataDir, "lifecycle-daily.json"), JSON.stringify(daily));
  writeFileSync(
    path.join(dataDir, "lifecycle-meta.json"),
    JSON.stringify({ asOf, attemptedFor: expected }),
  );
  clearLifecycleCache();
}

export function refreshLifecycleBook() {
  if (!refreshing) {
    refreshing = rebuild().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}
