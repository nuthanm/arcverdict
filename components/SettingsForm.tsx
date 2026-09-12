"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, REFRESH_OPTIONS } from "@/lib/settings";
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-[var(--muted)]">Fast average (days)</span>
          <input
            type="number"
            min={5}
            max={100}
            className="w-full border border-[var(--line)] bg-white px-3 py-2"
            value={draft.smaFast}
            onChange={(e) => update("smaFast", Number(e.target.value))}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--muted)]">Slow average (days)</span>
          <input
            type="number"
            min={20}
            max={400}
            className="w-full border border-[var(--line)] bg-white px-3 py-2"
            value={draft.smaSlow}
            onChange={(e) => update("smaSlow", Number(e.target.value))}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[var(--muted)]">Stop multiple</span>
          <input
            type="number"
            min={0.5}
            max={5}
            step={0.1}
            className="w-full border border-[var(--line)] bg-white px-3 py-2"
            value={draft.stopMultiple}
            onChange={(e) => update("stopMultiple", Number(e.target.value))}
          />
        </label>
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
