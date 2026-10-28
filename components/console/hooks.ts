"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConsoleEvent } from "@/lib/console/types";
import { errorMessage, getJson } from "./api";
import { useConsole } from "./provider";

async function fetchResource<T>(url: string, signal: AbortSignal): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await getJson<T>(url, signal) };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

type ResourceOptions = {
  /** Return true when a batch of live events should trigger a refetch. Resyncs always refetch. */
  refreshOn?: (events: ConsoleEvent[]) => boolean;
};

/**
 * Fetches a JSON resource and keeps it fresh from the realtime stream. Previous
 * data stays on screen while refetching so live updates never flash a skeleton.
 */
export function useResource<T>(url: string | null, options: ResourceOptions = {}) {
  const { subscribe } = useConsole();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const refreshOn = useRef(options.refreshOn);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    refreshOn.current = options.refreshOn;
  });

  const load = useCallback(async () => {
    if (!url) return;
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    const result = await fetchResource<T>(url, ac.signal);
    if (ac.signal.aborted) return;
    if (result.ok) {
      setData(result.data);
      setError(null);
    } else setError(result.error);
    setLoadedUrl(url);
  }, [url]);

  useEffect(() => {
    if (!url) return;
    const ac = new AbortController();
    controller.current?.abort();
    controller.current = ac;
    void fetchResource<T>(url, ac.signal).then((result) => {
      if (ac.signal.aborted) return;
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else setError(result.error);
      setLoadedUrl(url);
    });
    return () => ac.abort();
  }, [url]);

  useEffect(() => {
    if (!url) return;
    let timer: number | undefined;
    const unsubscribe = subscribe(({ events, resync }) => {
      const match = refreshOn.current;
      if (!resync && !(match ? match(events) : true)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 200);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [url, subscribe, load]);

  const stale = loadedUrl !== url;
  return { data: stale ? null : data, error: stale ? null : error, loading: stale || (data === null && error === null), refresh: load, setData };
}

/** A clock that ticks for live durations. One interval per component that needs it. */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export const touches = (types: string[]) => (events: ConsoleEvent[]) => events.some((e) => types.includes(e.type));
