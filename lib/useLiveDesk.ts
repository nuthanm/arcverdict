"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const gen = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      try {
        const res = await fetch(`/api/session?market=${market}`, { cache: "no-store" });
        const json = (await res.json()) as SessionPayload;
        if (!cancelled) setSession(json.session);
      } catch {
        if (!cancelled) setSession(null);
      }
    }
    loadSession();
    const id = setInterval(loadSession, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [market]);

  const loadBook = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const my = ++gen.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${path}?${scanQuery(settings)}&t=${Date.now()}`, {
        cache: "no-store",
        signal: abortRef.current?.signal,
      });
      const text = await res.text();
      if (my !== gen.current) return;
      let json: T & { error?: string };
      try {
        json = JSON.parse(text) as T & { error?: string };
      } catch {
        setError(bookErrorMessage(res.status, text));
        return;
      }
      if (!json.ok && json.error) setError(json.error);
      setData(json);
      setFetchedAt(Date.now());
    } catch (err) {
      if (my !== gen.current) return;
      if (isAbortError(err)) return;
      setError("Unable to refresh the book.");
    } finally {
      if (my === gen.current) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }, [path, settings]);

  useEffect(() => {
    if (!ready || !session) return;
    const ac = new AbortController();
    abortRef.current = ac;
    inFlight.current = false;
    void loadBook();
    if (!session.open) {
      return () => {
        ac.abort();
        if (abortRef.current === ac) abortRef.current = null;
        inFlight.current = false;
      };
    }
    const interval = refreshMs(settings.refreshMode, settings.continuousSeconds);
    if (!interval) {
      return () => {
        ac.abort();
        if (abortRef.current === ac) abortRef.current = null;
      };
    }
    const id = setInterval(() => {
      void loadBook();
    }, interval);
    return () => {
      ac.abort();
      if (abortRef.current === ac) abortRef.current = null;
      inFlight.current = false;
      clearInterval(id);
    };
  }, [ready, session?.open, settings.refreshMode, settings.continuousSeconds, loadBook]);

  const showRun = Boolean(session && (!session.open || settings.refreshMode === "manual"));
  const intervalSec = refreshMs(settings.refreshMode, settings.continuousSeconds) / 1000;

  return { session, data, loading, error, loadBook, showRun, fetchedAt, intervalSec };
}

function isAbortError(err: unknown) {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

function bookErrorMessage(status: number, body: string) {
  if (status === 504 || /FUNCTION_INVOCATION_TIMEOUT/i.test(body)) {
    return "Snapshot timed out. Retrying…";
  }
  return "Unable to refresh the book.";
}
