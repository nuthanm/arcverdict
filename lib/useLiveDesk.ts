"use client";

import { useCallback, useEffect, useState } from "react";
import { refreshMs, scanQuery } from "@/lib/settings";
import type { DeskSettings, SessionInfo } from "@/lib/types";

type SessionPayload = { ok: boolean; session: SessionInfo };

export function useLiveDesk<T extends { marketClosed?: boolean; ok?: boolean }>(options: {
  market: "nse" | "metals";
  path: string;
  settings: DeskSettings;
  ready: boolean;
}) {
  const { market, path, settings, ready } = options;
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      const res = await fetch(`/api/session?market=${market}`, { cache: "no-store" });
      const json = (await res.json()) as SessionPayload;
      if (!cancelled) setSession(json.session);
    }
    loadSession();
    const id = setInterval(loadSession, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [market]);

  const loadBook = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${path}?${scanQuery(settings)}&t=${Date.now()}`, { cache: "no-store" });
      const json = (await res.json()) as T & { error?: string };
      if (!json.ok && json.error) setError(json.error);
      setData(json);
      setFetchedAt(Date.now());
    } catch {
      setError("Unable to refresh the book.");
    } finally {
      setLoading(false);
    }
  }, [path, settings]);

  useEffect(() => {
    if (!ready || !session) return;
    if (!session.open) {
      setData(null);
      setFetchedAt(null);
      return;
    }
    void loadBook();
    const interval = refreshMs(settings.refreshMode, settings.continuousSeconds);
    if (!interval) return;
    const id = setInterval(() => {
      void loadBook();
    }, interval);
    return () => clearInterval(id);
  }, [ready, session?.open, settings.refreshMode, settings.continuousSeconds, loadBook]);

  const showRun = Boolean(session?.open && settings.refreshMode === "manual");
  const intervalSec = refreshMs(settings.refreshMode, settings.continuousSeconds) / 1000;

  return { session, data, loading, error, loadBook, showRun, fetchedAt, intervalSec };
}
