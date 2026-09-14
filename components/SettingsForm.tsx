"use client";

import { useEffect, useState } from "react";
import { InfoTip } from "@/components/InfoTip";
import { formatSecondsLabel } from "@/lib/format";
import {
  CONTINUOUS_PRESETS,
  DEFAULT_SETTINGS,
  MAX_CONTINUOUS_SEC,
  MIN_CONTINUOUS_SEC,
  REFRESH_OPTIONS,
} from "@/lib/settings";
import type { DeskSettings, RefreshMode } from "@/lib/types";
import { useDeskSettings } from "@/lib/useDeskSettings";

export function SettingsForm() {
  const { settings, save, ready } = useDeskSettings();
  const [draft, setDraft] = useState<DeskSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (ready) setDraft(settings);
  }, [ready, settings]);

  if (!ready) return <p className="text-sm text-[var(--muted)]">Loading configuration…</p>;

  function update<K extends keyof DeskSettings>(key: K, value: DeskSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  return (
    <form
      className="max-w-xl space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save(draft);
        setSaved(true);
      }}
    >
      <div>
        <h1 className="text-2xl text-[var(--ink)]">Configuration</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Refresh cadence applies while the market is open. Closed sessions never query the data feed.
          Feed URLs and API keys stay in server environment variables, not in this form.
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-[var(--ink)]">Refresh</legend>
        {REFRESH_OPTIONS.map((option) => (
          <label key={option.value} className="flex cursor-pointer gap-3 border border-[var(--line)] bg-white px-3 py-3">
            <input
              type="radio"
              name="refreshMode"
              checked={draft.refreshMode === option.value}
              onChange={() => update("refreshMode", option.value as RefreshMode)}
            />
            <span>
              <span className="block text-sm text-[var(--ink)]">{option.label}</span>
              <span className="block text-xs text-[var(--muted)]">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {draft.refreshMode === "continuous" && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-[var(--ink)]">Continuous interval</legend>
          <p className="text-xs text-[var(--muted)]">How often the open-market book refreshes.</p>
          <div className="flex flex-wrap gap-2">
            {CONTINUOUS_PRESETS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                aria-pressed={draft.continuousSeconds === seconds}
                className={`px-3 py-1.5 text-sm ${
                  draft.continuousSeconds === seconds
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] bg-white text-[var(--ink)]"
                }`}
                onClick={() => update("continuousSeconds", seconds)}
              >
                {seconds}s
              </button>
            ))}
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">Custom interval (seconds)</span>
            <span className="flex flex-wrap items-center gap-3">
              <input
                type="number"
                inputMode="numeric"
                min={MIN_CONTINUOUS_SEC}
                max={MAX_CONTINUOUS_SEC}
                step={1}
                aria-label="Custom interval in seconds"
                className="w-full max-w-[10rem] border border-[var(--line)] bg-white px-3 py-2 font-mono"
                value={Number.isFinite(draft.continuousSeconds) ? draft.continuousSeconds : ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  update("continuousSeconds", n);
                }}
              />
              <span className="text-sm text-[var(--ink)]">{formatSecondsLabel(draft.continuousSeconds)}</span>
            </span>
            <span className="mt-1 block text-xs text-[var(--muted)]">
              {MIN_CONTINUOUS_SEC}–{MAX_CONTINUOUS_SEC} seconds. Saved value is clamped to this range.
            </span>
          </label>
        </fieldset>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="text-sm">
          <span className="mb-1 flex items-center gap-1 text-[var(--muted)]">
            <label htmlFor="sma-fast">Fast average (days)</label>
            <InfoTip tipKey="smaFast" />
          </span>
          <input
            id="sma-fast"
            type="number"
            min={5}
            max={100}
            className="w-full border border-[var(--line)] bg-white px-3 py-2"
            value={draft.smaFast}
            onChange={(e) => update("smaFast", Number(e.target.value))}
          />
        </div>
        <div className="text-sm">
          <span className="mb-1 flex items-center gap-1 text-[var(--muted)]">
            <label htmlFor="sma-slow">Slow average (days)</label>
            <InfoTip tipKey="smaSlow" />
          </span>
          <input
            id="sma-slow"
            type="number"
            min={20}
            max={400}
            className="w-full border border-[var(--line)] bg-white px-3 py-2"
            value={draft.smaSlow}
            onChange={(e) => update("smaSlow", Number(e.target.value))}
          />
        </div>
        <div className="text-sm">
          <span className="mb-1 flex items-center gap-1 text-[var(--muted)]">
            <label htmlFor="stop-multiple">Stop multiple</label>
            <InfoTip tipKey="stopMultiple" />
          </span>
          <input
            id="stop-multiple"
            type="number"
            min={0.5}
            max={5}
            step={0.1}
            className="w-full border border-[var(--line)] bg-white px-3 py-2"
            value={draft.stopMultiple}
            onChange={(e) => update("stopMultiple", Number(e.target.value))}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="bg-[var(--accent)] px-4 py-2 text-sm text-white">
          Save
        </button>
        <button
          type="button"
          className="px-4 py-2 text-sm text-[var(--muted)]"
          onClick={() => {
            save(DEFAULT_SETTINGS);
            setDraft(DEFAULT_SETTINGS);
            setSaved(true);
          }}
        >
          Reset defaults
        </button>
        {saved && <span className="text-sm text-[var(--accent)]">Saved</span>}
      </div>
    </form>
  );
}
