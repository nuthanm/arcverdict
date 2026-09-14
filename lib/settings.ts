import type { DeskSettings, RefreshMode } from "./types";

export const SETTINGS_KEY = "arcv.desk.settings";

export const MIN_CONTINUOUS_SEC = 1;
export const MAX_CONTINUOUS_SEC = 3600;
export const DEFAULT_CONTINUOUS_SEC = 30;

export const CONTINUOUS_PRESETS = [15, 30, 45, 60] as const;

export const DEFAULT_SETTINGS: DeskSettings = {
  refreshMode: "continuous",
  continuousSeconds: DEFAULT_CONTINUOUS_SEC,
  smaFast: 50,
  smaSlow: 200,
  stopMultiple: 2.1,
};

export const REFRESH_OPTIONS: { value: RefreshMode; label: string; hint: string }[] = [
  { value: "continuous", label: "Continuous", hint: "Refresh on a short interval while the market is open." },
  { value: "1m", label: "Every minute", hint: "One snapshot per minute during the session." },
  { value: "5m", label: "Every 5 minutes", hint: "Suitable for a quieter desk." },
  { value: "15m", label: "Every 15 minutes", hint: "Intraday review cadence." },
  { value: "1h", label: "Every hour", hint: "Low-touch monitoring." },
  { value: "manual", label: "Manual", hint: "Refresh only when you request a snapshot." },
];

export function refreshMs(mode: RefreshMode, continuousSeconds = DEFAULT_CONTINUOUS_SEC) {
  if (mode === "continuous") {
    return clamp(continuousSeconds, MIN_CONTINUOUS_SEC, MAX_CONTINUOUS_SEC) * 1000;
  }
  if (mode === "1m") return 60_000;
  if (mode === "5m") return 5 * 60_000;
  if (mode === "15m") return 15 * 60_000;
  if (mode === "1h") return 60 * 60_000;
  return 0;
}

export function parseSettings(raw: unknown): DeskSettings {
  const input = (raw ?? {}) as Partial<DeskSettings>;
  const smaFast = clamp(Number(input.smaFast) || DEFAULT_SETTINGS.smaFast, 5, 100);
  const smaSlow = clamp(Number(input.smaSlow) || DEFAULT_SETTINGS.smaSlow, 20, 400);
  const stopMultiple = clamp(Number(input.stopMultiple) || DEFAULT_SETTINGS.stopMultiple, 0.5, 5);
  const continuousSeconds = clamp(
    Number(input.continuousSeconds) || DEFAULT_SETTINGS.continuousSeconds,
    MIN_CONTINUOUS_SEC,
    MAX_CONTINUOUS_SEC,
  );
  const refreshMode = REFRESH_OPTIONS.some((o) => o.value === input.refreshMode)
    ? (input.refreshMode as RefreshMode)
    : DEFAULT_SETTINGS.refreshMode;
  return {
    refreshMode,
    continuousSeconds,
    smaFast,
    smaSlow: Math.max(smaSlow, smaFast + 5),
    stopMultiple,
  };
}

export function scanQuery(settings: DeskSettings) {
  const params = new URLSearchParams({
    smaFast: String(settings.smaFast),
    smaSlow: String(settings.smaSlow),
    stopMultiple: String(settings.stopMultiple),
  });
  return params.toString();
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
