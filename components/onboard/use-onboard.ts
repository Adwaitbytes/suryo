"use client";

import { useCallback, useRef, useState } from "react";
import type { OnboardEvent, OnboardStep } from "@/lib/onboard/pipeline";

export type StepState = { status: "pending" | "active" | "done"; label: string; detail?: string; at?: number };
export type DoneEvent = Extract<OnboardEvent, { type: "done" }>;
export type Phase = "idle" | "running" | "done" | "error";
export type OnboardMode = "website" | "documents" | "both";
export type DocumentRead = { name: string; kind: string; pages: number; chars: number; at: number };

export const STEP_ORDER: OnboardStep[] = ["parse", "crawl", "chunk", "embed", "extract", "persona", "calendar", "live"];

/** The timeline shows only the steps this run will take. */
export function stepsFor(mode: OnboardMode): OnboardStep[] {
  if (mode === "website") return STEP_ORDER.filter((s) => s !== "parse");
  if (mode === "documents") return STEP_ORDER.filter((s) => s !== "crawl");
  return STEP_ORDER;
}

const PENDING_LABELS: Record<OnboardStep, string> = {
  parse: "Read the documents",
  crawl: "Read the website",
  chunk: "Split into passages",
  embed: "Embed the knowledge base",
  extract: "Extract the business profile",
  persona: "Generate the agent persona",
  calendar: "Create the booking calendar",
  live: "Go live",
};

const initialSteps = () =>
  Object.fromEntries(STEP_ORDER.map((s) => [s, { status: "pending", label: PENDING_LABELS[s] }])) as Record<OnboardStep, StepState>;

/** Drives POST /api/onboard and folds its NDJSON progress stream into view state. */
export function useOnboard() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState(initialSteps);
  const [pages, setPages] = useState<Array<{ url: string; title: string; at: number }>>([]);
  const [documents, setDocuments] = useState<DocumentRead[]>([]);
  const [mode, setMode] = useState<OnboardMode>("website");
  const [result, setResult] = useState<DoneEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finalMs, setFinalMs] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const apply = useCallback((event: OnboardEvent) => {
    if (event.type === "step") {
      setSteps((prev) => ({ ...prev, [event.step]: { status: event.status, label: event.label, detail: event.detail, at: event.elapsedMs } }));
    } else if (event.type === "page") {
      setPages((prev) => [...prev, { url: event.url, title: event.title, at: event.elapsedMs }]);
    } else if (event.type === "document") {
      setDocuments((prev) => [...prev, { name: event.name, kind: event.kind, pages: event.pages, chars: event.chars, at: event.elapsedMs }]);
    } else if (event.type === "done") {
      setResult(event);
      setFinalMs(event.totalMs);
      setPhase("done");
    } else {
      setError(event.message);
      setFinalMs(event.elapsedMs);
      setPhase("error");
    }
  }, []);

  /** A website alone posts JSON as before; any files switch to multipart with the website as an optional field. */
  const start = useCallback(
    async (input: { url?: string; files?: File[] }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const files = input.files ?? [];
      const url = input.url?.trim() ?? "";
      setMode(files.length === 0 ? "website" : url ? "both" : "documents");
      setPhase("running");
      setSteps(initialSteps());
      setPages([]);
      setDocuments([]);
      setResult(null);
      setError(null);
      setFinalMs(null);
      setStartedAt(performance.now());
      let terminal = false;
      try {
        let res: Response;
        if (files.length === 0) {
          res = await fetch("/api/onboard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
            signal: controller.signal,
          });
        } else {
          const form = new FormData();
          if (url) form.set("url", url);
          for (const file of files) form.append("files", file, file.name);
          res = await fetch("/api/onboard", { method: "POST", body: form, signal: controller.signal });
        }
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Onboarding failed with HTTP ${res.status}.`);
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as OnboardEvent;
            if (event.type === "done" || event.type === "error") terminal = true;
            apply(event);
          }
        }
        if (!terminal) throw new Error("The connection closed before onboarding finished. Try again.");
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Onboarding failed.");
        setPhase("error");
      }
    },
    [apply],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPhase("idle");
    setSteps(initialSteps());
    setPages([]);
    setDocuments([]);
    setResult(null);
    setError(null);
    setFinalMs(null);
    setStartedAt(null);
  }, []);

  return { phase, mode, steps, pages, documents, result, setResult, error, startedAt, finalMs, start, reset };
}
