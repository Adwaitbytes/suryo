"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Running stopwatch. Shows the server measured total once the run has finished. */
export function Timer({ startedAt, finalMs, running, className }: { startedAt: number | null; finalMs: number | null; running: boolean; className?: string }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running || startedAt === null) return;
    let frame = 0;
    const tick = () => {
      setNow(performance.now() - startedAt);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, startedAt]);
  const ms = finalMs ?? (running ? now : 0);
  const seconds = Math.floor(ms / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return (
    <span className={cn("font-mono tabular", className)} aria-live="off">
      {String(seconds).padStart(2, "0")}
      <span className="text-fg-faint">.</span>
      {tenths}
      <span className="ml-1 text-[0.45em] text-fg-subtle">s</span>
    </span>
  );
}
