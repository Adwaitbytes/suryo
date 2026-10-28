"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { VoiceCall, type CallState } from "./call";

/** Binds one VoiceCall to a component's lifetime and ends it as abandoned if the page goes away mid call. */
export function useVoiceCall(business: string, defaults: { agentName: string; businessName: string }): {
  call: VoiceCall;
  state: CallState;
} {
  const [call] = useState(() => new VoiceCall(business, defaults));
  const state = useSyncExternalStore(call.subscribe, call.getSnapshot, call.getSnapshot);

  useEffect(() => {
    const onPageHide = () => call.abandon();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      call.abandon();
      call.dispose();
    };
  }, [call]);

  return { call, state };
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
