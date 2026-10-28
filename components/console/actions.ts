"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage, sendJson } from "./api";
import { useConsole } from "./provider";

type Theme = "dark" | "light";
const THEME_KEY = "suryo-theme";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(current);
    const observer = new MutationObserver(() => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  const toggle = useCallback(() => {
    const next: Theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Theme still applies for this session.
    }
  }, []);
  return { theme, toggle };
}

export function useResetDemo() {
  const { toast, resync } = useConsole();
  const [pending, setPending] = useState(false);
  const reset = useCallback(async () => {
    setPending(true);
    const started = performance.now();
    try {
      const { ms } = await sendJson<{ ok: true; ms: number }>("/api/demo/reset", {});
      const roundTrip = Math.round(performance.now() - started);
      toast({ title: `Demo reset in ${ms.toLocaleString("en-IN")} ms`, body: `Fresh slots, bookings and history. ${roundTrip.toLocaleString("en-IN")} ms round trip.`, tone: "success" });
      resync();
    } catch (err) {
      toast({ title: "Reset failed", body: errorMessage(err), tone: "danger" });
    } finally {
      setPending(false);
    }
  }, [toast, resync]);
  return { reset, pending };
}

export function useRunFollowUps() {
  const { toast, resync } = useConsole();
  const [pending, setPending] = useState(false);
  const run = useCallback(async () => {
    setPending(true);
    try {
      const r = await sendJson<{ ms: number; abandoned: { closed: number }; followUps: { processed: number; sent: number; failed: number; callTasksDue: number } }>(
        "/api/cron/followups",
        {},
      );
      const parts = [
        `${r.followUps.sent} sent`,
        r.followUps.failed ? `${r.followUps.failed} failed` : null,
        r.followUps.callTasksDue ? `${r.followUps.callTasksDue} call tasks due` : null,
        r.abandoned.closed ? `${r.abandoned.closed} abandoned conversations closed` : null,
      ].filter(Boolean);
      toast({ title: `Follow up run finished in ${r.ms} ms`, body: parts.join(", "), tone: r.followUps.failed ? "neutral" : "success" });
      resync();
    } catch (err) {
      toast({ title: "Follow up run failed", body: errorMessage(err), tone: "danger" });
    } finally {
      setPending(false);
    }
  }, [toast, resync]);
  return { run, pending };
}
