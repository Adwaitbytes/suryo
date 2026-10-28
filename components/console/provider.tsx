"use client";

import { MotionConfig } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BusinessOption, ConsoleEvent, Snapshot } from "@/lib/console/types";
import { errorMessage, getJson } from "./api";

export type StreamMode = "connecting" | "live" | "polling";
export type Toast = { id: number; title: string; body?: string; tone?: "neutral" | "success" | "danger" };
/** `resync` means events may have been missed and every view should refetch. */
export type ConsoleSignal = { events: ConsoleEvent[]; resync: boolean };
type Listener = (signal: ConsoleSignal) => void;

type ConsoleContext = {
  businesses: BusinessOption[];
  business: BusinessOption | null;
  selectBusiness: (id: string) => void;
  snapshot: Snapshot | null;
  snapshotError: string | null;
  refreshSnapshot: () => Promise<void>;
  /** Tells every view to refetch, for example after a demo reset. */
  resync: () => void;
  streamMode: StreamMode;
  subscribe: (listener: Listener) => () => void;
  toasts: Toast[];
  toast: (toast: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  operator: string;
};

const Ctx = createContext<ConsoleContext | null>(null);

const BUSINESS_KEY = "suryo-console-business";
const DEFAULT_SLUG = "kesar";
const POLL_MS = 3_000;
const SSE_RETRY_FROM_POLLING_MS = 30_000;
const SNAPSHOT_DEBOUNCE_MS = 350;
export const OPERATOR = "Priya (front desk)";

async function fetchSnapshot(businessId: string): Promise<Snapshot | Error> {
  try {
    return await getJson<Snapshot>(`/api/console/snapshot?business=${businessId}`);
  } catch (err) {
    return new Error(errorMessage(err));
  }
}

function readStoredBusiness(): string | null {
  try {
    return localStorage.getItem(BUSINESS_KEY);
  } catch {
    return null;
  }
}

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [streamMode, setStreamMode] = useState<StreamMode>("connecting");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const listeners = useRef(new Set<Listener>());
  const cursor = useRef<number | null>(null);
  const toastId = useRef(0);

  const business = useMemo(() => businesses.find((b) => b.id === businessId) ?? null, [businesses, businessId]);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastId.current;
    setToasts((all) => [...all.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 4_500);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((all) => all.filter((x) => x.id !== id)), []);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  const broadcast = useCallback((signal: ConsoleSignal) => {
    for (const l of listeners.current) l(signal);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getJson<{ businesses: BusinessOption[] }>("/api/console/businesses")
      .then(({ businesses: list }) => {
        if (cancelled) return;
        setBusinesses(list);
        const stored = readStoredBusiness();
        const pick = list.find((b) => b.id === stored) ?? list.find((b) => b.slug === DEFAULT_SLUG) ?? list[0];
        setBusinessId(pick?.id ?? null);
        if (!pick) setSnapshotError("No businesses yet. Onboard one to get started.");
      })
      .catch((err: unknown) => !cancelled && setSnapshotError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  const selectBusiness = useCallback((id: string) => {
    try {
      localStorage.setItem(BUSINESS_KEY, id);
    } catch {
      // Storage can be unavailable in private windows; the choice just will not persist.
    }
    cursor.current = null;
    setSnapshot(null);
    setBusinessId(id);
  }, []);

  /** Applies a fetched snapshot, ignoring responses for a business the operator has since switched away from. */
  const applySnapshot = useCallback(
    (result: Snapshot | Error): Snapshot | null => {
      if (result instanceof Error) {
        setSnapshotError(result.message);
        return null;
      }
      if (result.business.id !== businessId) return null;
      setSnapshot(result);
      setSnapshotError(null);
      return result;
    },
    [businessId],
  );

  const loadSnapshot = useCallback(async (): Promise<Snapshot | null> => {
    if (!businessId) return null;
    return applySnapshot(await fetchSnapshot(businessId));
  }, [businessId, applySnapshot]);

  const refreshSnapshot = useCallback(async () => {
    await loadSnapshot();
  }, [loadSnapshot]);

  const resync = useCallback(() => {
    broadcast({ events: [], resync: true });
    void loadSnapshot();
  }, [broadcast, loadSnapshot]);

  // Realtime: SSE first, polling the snapshot as a fallback so the console never freezes.
  useEffect(() => {
    if (!businessId) return;
    let disposed = false;
    let source: EventSource | null = null;
    let pollTimer: number | undefined;
    let retryTimer: number | undefined;
    let debounce: number | undefined;
    let failures = 0;

    const scheduleSnapshot = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void loadSnapshot(), SNAPSHOT_DEBOUNCE_MS);
    };

    const stopPolling = () => {
      window.clearInterval(pollTimer);
      pollTimer = undefined;
    };

    const startPolling = () => {
      if (pollTimer || disposed) return;
      setStreamMode("polling");
      pollTimer = window.setInterval(async () => {
        const next = await loadSnapshot();
        if (next && cursor.current !== null && next.lastEventId > cursor.current) broadcast({ events: [], resync: true });
        if (next) cursor.current = next.lastEventId;
      }, POLL_MS);
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(connect, SSE_RETRY_FROM_POLLING_MS);
    };

    function connect() {
      if (disposed) return;
      source?.close();
      const after = cursor.current !== null ? `&after=${cursor.current}` : "";
      const es = new EventSource(`/api/console/stream?business=${businessId}${after}`);
      source = es;
      es.addEventListener("ready", (e) => {
        const { cursor: serverCursor } = JSON.parse((e as MessageEvent<string>).data) as { cursor: number };
        const missed = cursor.current === null;
        cursor.current = cursor.current ?? serverCursor;
        failures = 0;
        if (pollTimer) {
          stopPolling();
          broadcast({ events: [], resync: true });
        }
        if (missed) scheduleSnapshot();
        setStreamMode("live");
      });
      es.addEventListener("events", (e) => {
        const events = JSON.parse((e as MessageEvent<string>).data) as ConsoleEvent[];
        const last = Number((e as MessageEvent<string>).lastEventId);
        if (Number.isFinite(last)) cursor.current = last;
        if (!events.length) return;
        broadcast({ events, resync: false });
        scheduleSnapshot();
      });
      es.addEventListener("end", () => {
        es.close();
        connect();
      });
      es.onerror = () => {
        es.close();
        if (disposed) return;
        failures += 1;
        if (failures >= 2) startPolling();
        else {
          setStreamMode("connecting");
          window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(connect, 1_000);
        }
      };
    }

    void fetchSnapshot(businessId).then((result) => {
      if (disposed) return;
      const first = applySnapshot(result);
      if (first && cursor.current === null) cursor.current = first.lastEventId;
      connect();
    });

    return () => {
      disposed = true;
      source?.close();
      stopPolling();
      window.clearTimeout(retryTimer);
      window.clearTimeout(debounce);
    };
  }, [businessId, loadSnapshot, applySnapshot, broadcast]);

  const value = useMemo<ConsoleContext>(
    () => ({
      businesses,
      business,
      selectBusiness,
      snapshot,
      snapshotError,
      refreshSnapshot,
      resync,
      streamMode,
      subscribe,
      toasts,
      toast,
      dismissToast,
      operator: OPERATOR,
    }),
    [businesses, business, selectBusiness, snapshot, snapshotError, refreshSnapshot, resync, streamMode, subscribe, toasts, toast, dismissToast],
  );

  return (
    <Ctx.Provider value={value}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </Ctx.Provider>
  );
}

export function useConsole(): ConsoleContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConsole must be used inside ConsoleProvider");
  return ctx;
}
