"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, MessageSquare, Mic, MicOff, Phone, PhoneOff, RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ActionCards } from "@/components/call/action-cards";
import { Captions } from "@/components/call/captions";
import { CallVisualizer } from "@/components/call/visualizer";
import { Dot, type Tone } from "@/components/ui/badge";
import type { CallState } from "@/lib/voice/call";
import { usePrefersReducedMotion, useVoiceCall } from "@/lib/voice/use-voice-call";
import { cn } from "@/lib/utils";

type Props = {
  slug: string;
  agentName: string;
  businessName: string;
  languages: string[];
};

/** The person who picks up after a takeover; matches the console's default operator. */
const HUMAN_NAME = "Priya";

export function CallScreen({ slug, agentName, businessName, languages }: Props) {
  const { call, state } = useVoiceCall(slug, { agentName, businessName });
  const reducedMotion = usePrefersReducedMotion();
  const levels = useCallback(() => call.levels(), [call]);
  const { phase } = state;
  const inCall = phase === "connecting" || phase === "live";
  const chatHref = state.conversationId ? `/chat/${slug}?c=${state.conversationId}` : `/chat/${slug}`;
  const isPreCall = phase === "idle" || phase === "starting" || (phase === "error" && !state.conversationId);

  return (
    <main className="grain relative isolate flex h-dvh min-h-[560px] flex-col overflow-hidden bg-bg text-fg">
      <header className="relative z-10 mx-auto flex h-14 w-full max-w-lg shrink-0 items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
        <StatusLabel state={state} />
        {state.connectedAt && (inCall || phase === "human") ? (
          <span className="flex items-center gap-3">
            {phase !== "human" ? <LatencyToken latency={state.latency} /> : null}
            <CallTimer from={state.connectedAt} />
          </span>
        ) : null}
      </header>

      <section className="relative flex min-h-0 flex-1 flex-col items-center">
        <div className="relative z-10 flex flex-col items-center px-6 pt-3 text-center sm:pt-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={phase === "human" ? "human" : "agent"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex flex-col items-center"
            >
              <h1 className="font-display text-[56px] leading-[0.95] text-fg sm:text-[68px]">{phase === "human" ? HUMAN_NAME : state.agentName}</h1>
              <p className="mt-2 text-[15px] text-fg-muted">{phase === "human" ? `Front desk, ${state.businessName}` : `Front desk at ${state.businessName}`}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="relative w-full min-h-0 flex-1">
          <CallVisualizer
            levels={levels}
            phase={phase}
            activity={state.activity}
            reducedMotion={reducedMotion}
            className="absolute inset-0 m-auto aspect-square h-auto max-h-full w-full max-w-[460px]"
          />
        </div>
      </section>

      <section className="relative z-10 mx-auto flex w-full max-w-lg shrink-0 flex-col gap-4 px-5">
        {isPreCall ? (
          <PreCall
            busy={phase === "starting"}
            error={phase === "error" ? state.error : null}
            languages={languages}
            onStart={() => void call.start()}
            chatHref={chatHref}
          />
        ) : phase === "ended" || phase === "error" ? (
          <CallOver state={state} chatHref={chatHref} onRestart={() => void call.start()} />
        ) : (
          <>
            {phase === "human" ? <HandoffLine reducedMotion={reducedMotion} /> : <ActionCards actions={state.actions} reducedMotion={reducedMotion} />}
            <Captions
              captions={state.captions}
              agentName={state.agentName}
              humanName={HUMAN_NAME}
              reducedMotion={reducedMotion}
              limit={phase === "human" ? 4 : 3}
              emptyText={phase === "connecting" ? "Connecting you now." : `${state.agentName} will answer in a moment.`}
            />
            {phase === "human" ? <HumanReply onSend={(text) => call.sendText(text)} /> : null}
          </>
        )}
      </section>

      {!isPreCall && phase !== "ended" && phase !== "error" ? (
        <footer className="relative z-10 mx-auto flex w-full max-w-lg shrink-0 items-start justify-center gap-10 px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {phase === "human" ? null : (
            <RoundControl
              label={state.muted ? "Unmute" : "Mute"}
              pressed={state.muted}
              onClick={() => call.toggleMute()}
              disabled={phase !== "live"}
            >
              {state.muted ? <MicOff className="size-[22px]" /> : <Mic className="size-[22px]" />}
            </RoundControl>
          )}
          <RoundControl label="End" tone="danger" onClick={() => void call.end()}>
            <PhoneOff className="size-6" />
          </RoundControl>
          <RoundLink label="Chat" href={chatHref} onNavigate={() => void call.end()}>
            <MessageSquare className="size-[22px]" />
          </RoundLink>
        </footer>
      ) : (
        <div className="h-[max(1.5rem,env(safe-area-inset-bottom))] shrink-0" />
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ */

function StatusLabel({ state }: { state: CallState }) {
  const { label, tone, live } = statusFor(state);
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-fg-muted" aria-live="polite">
      <Dot tone={tone} live={live} className="size-2" />
      {label}
    </span>
  );
}

function statusFor(state: CallState): { label: string; tone: Tone; live: boolean } {
  switch (state.phase) {
    case "idle":
      return { label: "Ready when you are", tone: "neutral", live: false };
    case "starting":
      return { label: "Waiting for your microphone", tone: "warning", live: true };
    case "connecting":
      return { label: "Connecting", tone: "warning", live: true };
    case "live":
      if (state.muted) return { label: "Muted", tone: "neutral", live: false };
      if (state.activity === "speaking") return { label: "Speaking", tone: "accent", live: true };
      if (state.activity === "thinking") return { label: "Thinking", tone: "accent", live: true };
      return { label: "Listening", tone: "success", live: true };
    case "human":
      return { label: "With the front desk", tone: "success", live: true };
    case "ended":
      return { label: "Call ended", tone: "neutral", live: false };
    case "error":
      return { label: "Call not connected", tone: "danger", live: false };
  }
}

function CallTimer({ from }: { from: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <time className="font-mono text-[13px] text-fg-muted tabular" aria-label="Call duration">
      {formatDuration(now - from)}
    </time>
  );
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Voice to voice reply time as one quiet token beside the timer. */
function LatencyToken({ latency }: { latency: CallState["latency"] }) {
  const ms = latency.last ?? latency.average;
  if (ms === null) return null;
  const seconds = (ms / 1000).toFixed(1);
  const average = latency.average === null ? "" : `, average ${(latency.average / 1000).toFixed(1)} seconds`;
  return (
    <span className="font-mono text-[13px] text-fg-subtle tabular" aria-label={`Reply time ${seconds} seconds${average}`} title="Voice to voice reply time">
      {seconds} s
    </span>
  );
}

function PreCall({
  busy,
  error,
  languages,
  onStart,
  chatHref,
}: {
  busy: boolean;
  error: CallState["error"];
  languages: string[];
  onStart: () => void;
  chatHref: string;
}) {
  const spoken = languageLine(languages);
  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <div role="alert" className="flex gap-3 rounded-2xl border border-danger/25 bg-danger-soft px-4 py-3.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
          <p className="text-sm leading-relaxed text-fg">{error.message}</p>
        </div>
      ) : (
        <p className="text-center text-[15px] leading-relaxed text-pretty text-fg-muted">
          Ask about treatments and prices, or book a time that suits you. {spoken}
        </p>
      )}
      {error?.kind === "mic-denied" ? (
        <>
          <Link
            href={chatHref}
            className="inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-accent text-[16px] font-medium text-accent-fg transition-[background-color,transform] duration-150 ease-out hover:bg-accent-strong active:scale-[0.985]"
          >
            <MessageSquare className="size-[18px]" />
            Continue in chat
          </Link>
          <button
            type="button"
            onClick={onStart}
            className="mx-auto inline-flex items-center gap-2 rounded text-[13px] text-fg-muted underline decoration-border-strong underline-offset-4 transition-colors hover:text-fg"
          >
            I have allowed the microphone, try again
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onStart}
            disabled={busy}
            className="group inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-accent text-[16px] font-medium text-accent-fg shadow-[0_1px_0_rgb(255_255_255/0.3)_inset,0_10px_30px_-10px_rgb(255_122_48/0.6)] transition-[background-color,transform] duration-150 ease-out hover:bg-accent-strong active:scale-[0.985] disabled:opacity-70"
          >
            {error ? <RotateCcw className="size-[18px]" /> : <Phone className="size-[18px] transition-transform duration-200 group-hover:-rotate-12" />}
            {busy ? "Allow the microphone to continue" : error ? "Try the call again" : "Start call"}
          </button>
          <p className="text-center text-[13px] text-fg-subtle">
            Prefer to type?{" "}
            <Link href={chatHref} className="rounded text-fg-muted underline decoration-border-strong underline-offset-4 transition-colors hover:text-fg hover:decoration-fg-muted">
              Continue in chat
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function languageLine(languages: string[]): string {
  const names = languages.length ? languages : ["English", "Hindi", "Hinglish"];
  if (names.length === 1) return `Speak in ${names[0]}.`;
  return `Speak in ${names.slice(0, -1).join(", ")} or ${names.at(-1)}.`;
}

function CallOver({ state, chatHref, onRestart }: { state: CallState; chatHref: string; onRestart: () => void }) {
  const dropped = state.phase === "error";
  const duration = state.connectedAt && state.endedAt ? formatDuration(state.endedAt - state.connectedAt) : null;
  return (
    <div className="flex flex-col gap-5">
      {dropped && state.error ? (
        <div role="alert" className="flex gap-3 rounded-2xl border border-danger/25 bg-danger-soft px-4 py-3.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
          <p className="text-sm leading-relaxed text-fg">{state.error.message}</p>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-[17px] text-fg">Thanks for calling.</p>
          <p className="mt-1 text-[14px] text-fg-muted">
            {duration ? <span className="font-mono tabular">{duration}</span> : null}
            {duration ? " on the line. " : ""}The front desk has a summary of everything you discussed.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-medium text-accent-fg transition-[background-color,transform] duration-150 hover:bg-accent-strong active:scale-[0.985]"
        >
          <Phone className="size-4" />
          Call again
        </button>
        <Link
          href={chatHref}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-surface-2 text-[15px] font-medium text-fg transition-colors hover:border-border-strong hover:bg-surface-3"
        >
          <MessageSquare className="size-4" />
          Open chat
        </Link>
      </div>
    </div>
  );
}

function HandoffLine({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <motion.p
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center justify-center gap-2 text-[13px] text-success"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-success" />
      {HUMAN_NAME} joined with your call summary
    </motion.p>
  );
}

function HumanReply({ onSend }: { onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    setFailure(null);
    try {
      await onSend(message);
      setText("");
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "Your message did not send. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface pl-4 pr-1.5 shadow-sm transition-colors focus-within:border-border-strong">
        <label htmlFor="human-reply" className="sr-only">
          Message the front desk
        </label>
        <input
          id="human-reply"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Reply to ${HUMAN_NAME}`}
          maxLength={2000}
          autoComplete="off"
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-fg placeholder:text-fg-subtle focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          aria-label="Send"
          className="grid size-9 place-items-center rounded-full bg-accent text-accent-fg transition-[background-color,color] hover:bg-accent-strong disabled:bg-surface-3 disabled:text-fg-faint disabled:opacity-100 disabled:hover:bg-surface-3"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
      {failure ? (
        <p role="alert" className="px-4 text-[13px] text-danger">
          {failure}
        </p>
      ) : null}
    </form>
  );
}

const controlTone = {
  neutral: "size-14 border border-border bg-surface-2 text-fg hover:border-border-strong hover:bg-surface-3 aria-pressed:border-transparent aria-pressed:bg-fg aria-pressed:text-bg",
  danger: "size-16 bg-danger text-white shadow-[0_10px_30px_-10px_rgb(242_85_90/0.6)] hover:brightness-110",
} as const;

function RoundControl({
  label,
  tone = "neutral",
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  tone?: keyof typeof controlTone;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex w-16 flex-col items-center gap-2">
      <div className="grid h-16 place-items-center">
        <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed}
        className={cn(
          "grid place-items-center rounded-full transition-[background-color,border-color,color,transform,filter] duration-150 ease-out active:scale-95 disabled:opacity-40 focus-visible:rounded-full",
          controlTone[tone],
        )}
      >
        {children}
        </button>
      </div>
      <span aria-hidden className="text-[12px] text-fg-subtle">
        {label}
      </span>
    </div>
  );
}

function RoundLink({ label, href, onNavigate, children }: { label: string; href: string; onNavigate: () => void; children: ReactNode }) {
  return (
    <div className="flex w-16 flex-col items-center gap-2">
      <div className="grid h-16 place-items-center">
        <Link
        href={href}
        onClick={onNavigate}
        aria-label="Switch to chat"
        className={cn("grid place-items-center rounded-full transition-[background-color,border-color,transform] duration-150 ease-out active:scale-95 focus-visible:rounded-full", controlTone.neutral)}
      >
        {children}
        </Link>
      </div>
      <span aria-hidden className="text-[12px] text-fg-subtle">
        {label}
      </span>
    </div>
  );
}
