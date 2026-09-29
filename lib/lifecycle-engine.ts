import type { DailyBar } from "./daily-history";
import type { DailyLifecycleRow, LifecycleMetrics, LifecycleResearch, LifecycleRow } from "./lifecycle";
import { buildMetrics, type MetricRow } from "./metric-engine";

type Day = {
  metric: MetricRow;
  bar: DailyBar;
  slopeLevel: number | null;
  rsiLevel: number | null;
  volumeLevel: number | null;
  healthScore: number | null;
  healthState: string | null;
  pressure: string | null;
  healthPressure1d: number | null;
  healthPressure5d: number | null;
  lowerHigh: boolean;
  lowerLow: boolean;
  structureState: string;
  deteriorationPersistence: number;
  decayStatus: string;
  candidateStatus: string;
  suggestion: string;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function expandingLevel(values: Array<number | null>, index: number) {
  const current = values[index];
  if (current == null) return null;
  const window = values.slice(0, index + 1).filter((value): value is number => value != null);
  if (!window.length) return null;
  return (100 * window.filter((value) => value <= current).length) / window.length;
}

function healthState(score: number) {
  if (score < 20) return "Deteriorating";
  if (score < 40) return "Weakening";
  if (score < 60) return "Transition";
  if (score < 80) return "Healthy";
  return "Extreme Strong";
}

function suggestionFor(day: Day) {
  if (day.metric.rsi == null) return "INSUFFICIENT DATA - DO NOT INTERPRET";
  if (day.decayStatus === "CONFIRMED") return "CAUTION TO EXIT";
  if (day.candidateStatus !== "No Candidate") {
    if (day.healthState === "Deteriorating") return "CAUTION - TREND COOLING";
    if (day.structureState !== "Structure Stable") return "POTENTIAL ENTRY - STRUCTURE WARNING";
    return "POTENTIAL ENTRY";
  }
  if (day.structureState === "TRANSITION CONFIRMED") {
    return day.pressure === "Improving" ? "STRUCTURE WARNING - HEALTH RECOVERING" : "STRUCTURE WARNING - MONITOR";
  }
  if (day.deteriorationPersistence >= 2 && day.healthState === "Weakening") return "CAUTION - TREND DECAYING";
  if (day.pressure === "Cooling") return "TREND COOLING - MONITOR";
  return "MONITOR";
}

export function buildSymbolLifecycle(company: string, bars: DailyBar[]) {
  const metrics = buildMetrics(bars);
  const strengths = metrics.map((row) => row.slopeStrength);
  const rsis = metrics.map((row) => row.rsi);
  const volumes = metrics.map((row) => row.volumeParticipation);
  const days: Day[] = metrics.map((metric, i) => {
    const slopeLevel = expandingLevel(strengths, i);
    const rsiLevel = expandingLevel(rsis, i);
    const volumeLevel = expandingLevel(volumes, i);
    const levels = [slopeLevel, metric.runningSumPercentile, rsiLevel, volumeLevel].filter(
      (value): value is number => value != null,
    );
    const healthScore = levels.length ? levels.reduce((sum, value) => sum + value, 0) / levels.length : null;
    const lowerHigh = i > 0 && bars[i].high < bars[i - 1].high;
    const lowerLow = i > 0 && bars[i].low < bars[i - 1].low;
    let bothRun = 0;
    for (let j = i; j > 0; j--) {
      if (bars[j].high < bars[j - 1].high && bars[j].low < bars[j - 1].low) bothRun += 1;
      else break;
    }
    const structureState =
      bothRun >= 2 ? "TRANSITION CONFIRMED" : lowerHigh || lowerLow ? "TRANSITION DEVELOPING" : "Structure Stable";
    return {
      metric,
      bar: bars[i],
      slopeLevel,
      rsiLevel,
      volumeLevel,
      healthScore,
      healthState: healthScore == null ? null : healthState(healthScore),
      pressure: null,
      healthPressure1d: null,
      healthPressure5d: null,
      lowerHigh,
      lowerLow,
      structureState,
      deteriorationPersistence: 0,
      decayStatus: "Not confirmed",
      candidateStatus: "No Candidate",
      suggestion: "INSUFFICIENT DATA - DO NOT INTERPRET",
    };
  });

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const prev = i > 0 ? days[i - 1] : null;
    const back5 = i >= 5 ? days[i - 5] : null;
    if (day.healthScore != null && prev?.healthScore != null) {
      day.healthPressure1d = day.healthScore - prev.healthScore;
      day.pressure = day.healthPressure1d > 0 ? "Improving" : "Cooling";
      day.deteriorationPersistence =
        day.healthScore < prev.healthScore ? prev.deteriorationPersistence + 1 : 0;
    } else {
      day.pressure = "Cooling";
    }
    if (day.healthScore != null && back5?.healthScore != null) {
      day.healthPressure5d = day.healthScore - back5.healthScore;
    }
    day.decayStatus =
      day.deteriorationPersistence >= 3 &&
      (day.healthState === "Weakening" || day.healthState === "Deteriorating")
        ? "CONFIRMED"
        : "Not confirmed";
    const r1 =
      day.pressure === "Improving" &&
      (day.healthState === "Healthy" || day.healthState === "Transition") &&
      day.structureState === "Structure Stable";
    const r2 =
      day.structureState === "TRANSITION CONFIRMED" && day.metric.slope5 > 0 && (day.healthScore ?? 0) >= 40;
    day.candidateStatus = r1 && r2 ? "R1 + R2" : r1 ? "R1" : r2 ? "R2" : "No Candidate";
    day.suggestion = suggestionFor(day);
  }

  const latestDay = days[days.length - 1];
  const candidateRows = days.filter((day) => day.candidateStatus !== "No Candidate").length;
  const confirmedDecayRows = days.filter((day) => day.decayStatus === "CONFIRMED").length;
  const research: LifecycleResearch = {
    rows: days.length,
    startDate: days[0]?.metric.date ?? null,
    endDate: latestDay?.metric.date ?? null,
    candidateRows,
    confirmedDecayRows,
  };
  const metricsOut: LifecycleMetrics = {
    trend: latestDay.metric.trend,
    trendScore: latestDay.metric.trendScore,
    totalScore: null,
    runningSum: round2(latestDay.metric.runningSum),
    runningSumPercentile: round2(latestDay.metric.runningSumPercentile),
    slopeStrength: round2(latestDay.metric.slopeStrength),
    consistency: round2(latestDay.metric.consistency),
    momentum: latestDay.metric.rsi == null ? null : round2(latestDay.metric.rsi),
    acceleration: round2(latestDay.metric.acceleration),
    ema20: latestDay.metric.ema20 == null ? null : round2(latestDay.metric.ema20),
    ema50: latestDay.metric.ema50 == null ? null : round2(latestDay.metric.ema50),
    ema200: latestDay.metric.ema200 == null ? null : round2(latestDay.metric.ema200),
    rsi: latestDay.metric.rsi == null ? null : round2(latestDay.metric.rsi),
    adx: latestDay.metric.adx == null ? null : round2(latestDay.metric.adx),
    atrPct: latestDay.metric.atrPct == null ? null : round2(latestDay.metric.atrPct),
    bbPosition: latestDay.metric.bbPosition == null ? null : round2(latestDay.metric.bbPosition),
  };

  const latest: LifecycleRow = {
    company,
    date: latestDay.metric.date,
    close: round2(latestDay.metric.close),
    healthScore: latestDay.healthScore == null ? null : round2(latestDay.healthScore),
    healthState: latestDay.healthState,
    pressure: latestDay.pressure,
    healthPressure1d: latestDay.healthPressure1d == null ? null : round2(latestDay.healthPressure1d),
    healthPressure5d: latestDay.healthPressure5d == null ? null : round2(latestDay.healthPressure5d),
    slopeStrengthLevel: latestDay.slopeLevel == null ? null : round2(latestDay.slopeLevel),
    runningSumLevel: round2(latestDay.metric.runningSumPercentile),
    rsiLevel: latestDay.rsiLevel == null ? null : round2(latestDay.rsiLevel),
    volumeParticipation: latestDay.metric.volumeParticipation == null ? null : round2(latestDay.metric.volumeParticipation),
    volumeParticipationLevel: latestDay.volumeLevel == null ? null : round2(latestDay.volumeLevel),
    deterioratingComponents: null,
    improvingComponents: null,
    deteriorationPersistence: latestDay.deteriorationPersistence,
    priceSlope3d: round2(latestDay.metric.slope5),
    lowerHigh: latestDay.lowerHigh,
    lowerLow: latestDay.lowerLow,
    structureState: latestDay.structureState,
    decayStatus: latestDay.decayStatus,
    candidateStatus: latestDay.candidateStatus,
    suggestion: latestDay.suggestion,
    metrics: metricsOut,
    research,
  };

  const daily: DailyLifecycleRow[] = days.slice(-20).map((day) => ({
    date: day.metric.date,
    close: round2(day.metric.close),
    trend: day.metric.trend,
    trendScore: day.metric.trendScore,
    healthScore: day.healthScore == null ? null : round2(day.healthScore),
    healthState: day.healthState,
    pressure: day.pressure,
    structureState: day.structureState,
    decayStatus: day.decayStatus,
    candidateStatus: day.candidateStatus,
    suggestion: day.suggestion,
  }));

  return { latest, daily };
}
