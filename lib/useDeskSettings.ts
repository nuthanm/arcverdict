"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, parseSettings, SETTINGS_KEY } from "@/lib/settings";
import type { DeskSettings } from "@/lib/types";

export function useDeskSettings() {
  const [settings, setSettings] = useState<DeskSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings(parseSettings(JSON.parse(raw)));
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
    setReady(true);
  }, []);

  const save = useCallback((next: DeskSettings) => {
    const parsed = parseSettings(next);
    setSettings(parsed);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
  }, []);

  return { settings, save, ready };
}
