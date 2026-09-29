import { readFileSync } from "node:fs";
import path from "node:path";

export type LifecycleMetrics = {
  trend: string | null;
  trendScore: number | null;
  totalScore: number | null;
  runningSum: number | null;
  runningSumPercentile: number | null;
  slopeStrength: number | null;
  consistency: number | null;
  momentum: number | null;
  acceleration: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi: number | null;
  adx: number | null;
  atrPct: number | null;
  bbPosition: number | null;
};

export type LifecycleResearch = {
  rows: number | null;
  startDate: string | null;
  endDate: string | null;
  candidateRows: number | null;
  confirmedDecayRows: number | null;
};

export type LifecycleRow = {
  company: string;
  date: string | null;
  close: number | null;
  healthScore: number | null;
  healthState: string | null;
  pressure: string | null;
  healthPressure1d: number | null;
  healthPressure5d: number | null;
  slopeStrengthLevel: number | null;
  runningSumLevel: number | null;
  rsiLevel: number | null;
  volumeParticipation: number | null;
  volumeParticipationLevel: number | null;
  deterioratingComponents: number | null;
  improvingComponents: number | null;
  deteriorationPersistence: number | null;
  priceSlope3d: number | null;
  lowerHigh: boolean | null;
  lowerLow: boolean | null;
  structureState: string | null;
  decayStatus: string | null;
  candidateStatus: string | null;
  suggestion: string | null;
  metrics: LifecycleMetrics | null;
  research: LifecycleResearch | null;
};

export type DailyLifecycleRow = {
  date: string | null;
  close: number | null;
  trend: string | null;
  trendScore: number | null;
  healthScore: number | null;
  healthState: string | null;
  pressure: string | null;
  structureState: string | null;
  decayStatus: string | null;
  candidateStatus: string | null;
  suggestion: string | null;
};

type Store = {
  latest: LifecycleRow[];
  daily: Record<string, DailyLifecycleRow[]>;
};

let store: Store | null = null;

function loadStore(): Store {
  if (store) return store;
  const dir = path.join(process.cwd(), "data");
  store = {
    latest: JSON.parse(readFileSync(path.join(dir, "lifecycle-latest.json"), "utf8")) as LifecycleRow[],
    daily: JSON.parse(readFileSync(path.join(dir, "lifecycle-daily.json"), "utf8")) as Record<
      string,
      DailyLifecycleRow[]
    >,
  };
  return store;
}

export function clearLifecycleCache() {
  store = null;
}

export function lifecycleBook() {
  return loadStore().latest;
}

export function lifecycleHistory() {
  const loaded = loadStore();
  return { latest: loaded.latest, daily: loaded.daily };
}

export function lifecycleDaily(company: string) {
  return loadStore().daily[company] ?? [];
}

