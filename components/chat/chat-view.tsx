"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Check, ChevronDown, ExternalLink, Loader2, Phone, RotateCcw, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Dot } from "@/components/ui/badge";
import type { Card, SourceRef } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { CardView, slotRequest } from "./cards";
import type { ChatMessage, ToolStep } from "./protocol";
import { useChat } from "./use-chat";

export type ChatViewProps = {
  slug: string;
  businessName: string;
  agentName: string;
  embed: boolean;
  initialConversationId: string | null;
};

const QUICK_REPLIES = [
  "Kal shaam teeth cleaning ka slot?",
  "What does a root canal cost?",
  "Reschedule my appointment",
  "Do you treat acne scars?",
  "Palasia branch kab khulta hai?",
];

const OPERATOR_NAME = "Priya";
const EASE = [0.22, 1, 0.36, 1] as const;

export function ChatView({ slug, businessName, agentName, embed, initialConversationId }: ChatViewProps) {
  const chat = useChat({ slug, initialConversationId });
  const { messages, status, phase, online } = chat;
  const reduce = useReducedMotion() ?? false;
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const humanActive = status === "human";
  const canSend = phase === "ready" && online && draft.trim().length > 0;
  const lastAgentIndex = messages.findLastIndex((m) => m.role === "agent");

  const focusInput = useCallback(() => inputRef.current?.focus({ preventScroll: true }), []);

  useEffect(() => {
    // Opening the keyboard uninvited is hostile on phones, so only autofocus with a fine pointer.
    if (window.matchMedia("(pointer: fine)").matches) focusInput();
  }, [focusInput]);

  useEffect(() => {
    if (!embed) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source === window.parent && event.data === "suryo:focus") focusInput();
    };
    // Keystrokes inside the iframe never reach the host page, so Escape is forwarded from here.
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") window.parent.postMessage("suryo:close", "*");
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKey);
    };
  }, [embed, focusInput]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [messages, reduce]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [draft]);

  const submit = (text: string) => {
    if (!online) return;
    if (chat.send(text)) {
      stickRef.current = true;
      setDraft("");
      focusInput();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Devanagari and other IME input commits with Enter; never send mid composition.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit(draft);
    }
  };

  const close = () => window.parent.postMessage("suryo:close", "*");

  return (
    <div className={cn("relative flex h-dvh w-full flex-col overflow-hidden bg-bg", !embed && "sm:items-center sm:bg-bg-subtle")}>
      <div
        className={cn(
          "flex h-full min-h-0 w-full flex-col bg-bg",
          !embed && "sm:my-6 sm:h-[calc(100dvh-3rem)] sm:max-w-[440px] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:shadow-lg",
        )}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-bg/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <AgentMark name={agentName} human={humanActive} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[14px] font-medium leading-tight text-fg">{businessName}</h1>
            <p className="flex items-center gap-1.5 truncate text-2xs text-fg-subtle">
              <Dot tone={humanActive ? "success" : "accent"} live />
              {humanActive ? `${OPERATOR_NAME}, front desk` : `${agentName}, AI front desk`}
            </p>
          </div>
          <a
            href={`/call/${slug}${chat.conversationId ? `?c=${chat.conversationId}` : ""}`}
            target={embed ? "_blank" : undefined}
            rel={embed ? "noopener" : undefined}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 text-xs font-medium text-fg transition-colors hover:border-border-strong hover:bg-surface-3"
          >
            <Phone aria-hidden className="size-3.5 text-accent" />
            <span className="max-[359px]:sr-only">{embed ? "Call" : "Call instead"}</span>
          </a>
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                chat.reset();
                focusInput();
              }}
              disabled={phase === "sending"}
              className="grid size-8 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
              aria-label="Start a new conversation"
              title="New conversation"
            >
              <RotateCcw aria-hidden className="size-3.5" />
            </button>
          ) : null}
          {embed ? (
            <button
              type="button"
              onClick={close}
              className="grid size-8 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
              aria-label="Close chat"
            >
              <X aria-hidden className="size-4" />
            </button>
          ) : null}
        </header>

        <AnimatePresence initial={false}>
          {!online ? (
            <Banner key="offline" tone="warning" reduce={reduce}>
              <WifiOff aria-hidden className="size-3.5" />
              You are offline. Reconnect to keep chatting.
            </Banner>
          ) : humanActive ? (
            <Banner key="human" tone="success" reduce={reduce}>
              <Dot tone="success" live />
              {OPERATOR_NAME} from the front desk is here and has the full conversation.
            </Banner>
          ) : status === "escalated" ? (
            <Banner key="escalated" tone="danger" reduce={reduce}>
              <Dot tone="danger" live />
              Connecting you to the front desk. Stay on this chat.
            </Banner>
          ) : null}
        </AnimatePresence>

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="scroll-quiet min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {phase === "loading" ? (
            <LoadingState />
          ) : messages.length === 0 ? (
            <EmptyState agentName={agentName} businessName={businessName} onPick={submit} disabled={!online} reduce={reduce} />
          ) : (
            <ol className="flex flex-col gap-4 px-4 py-5" aria-label="Conversation">
              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <motion.li
                    key={m.key}
                    layout={reduce ? false : "position"}
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, ease: EASE }}
                    className={cn("flex", m.role === "customer" ? "justify-end" : "justify-start")}
                  >
                    {m.role === "customer" ? (
                      <CustomerBubble text={m.content} />
                    ) : (
                      <AgentTurn
                        message={m}
                        agentName={agentName}
                        reduce={reduce}
                        slotsDisabled={i !== lastAgentIndex || phase !== "ready" || humanActive || !online}
                        onPickSlot={(slot) => submit(slotRequest(slot))}
                        onRetry={() => chat.retry(m.id)}
                        retryDisabled={phase !== "ready" || !online}
                      />
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          )}
        </div>

        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {chat.announcement}
        </div>

        <form
          className="shrink-0 border-t border-border bg-bg px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
        >
          <div className="flex items-end gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-sm transition-[border-color,box-shadow] focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
            <label htmlFor="suryo-composer" className="sr-only">
              Message {agentName}
            </label>
            <textarea
              id="suryo-composer"
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={2000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={humanActive ? `Reply to ${OPERATOR_NAME}` : "Ask in English, Hindi or Hinglish"}
              enterKeyHint="send"
              autoComplete="off"
              // The wrapper draws the focus ring; the global unlayered outline would double it.
              style={{ outline: "none" }}
              className="max-h-[132px] min-h-6 flex-1 resize-none bg-transparent py-0.5 text-[15px] leading-6 text-fg placeholder:text-fg-faint"
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg transition-[background-color,opacity,transform] hover:bg-accent-strong active:scale-95 disabled:bg-surface-3 disabled:text-fg-faint"
            >
              {phase === "sending" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ArrowUp aria-hidden className="size-4" />}
            </button>
          </div>
          <p className="mt-2 text-center font-mono text-[10px] tracking-wide text-fg-faint">
            Answers come from {businessName}. Powered by Suryo.
          </p>
        </form>
      </div>
    </div>
  );
}

function AgentMark({ name, human }: { name: string; human: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-full border text-[15px] font-semibold leading-none",
        human ? "border-success/40 bg-success-soft text-success" : "border-accent/40 bg-accent-soft text-accent",
      )}
    >
      {(human ? OPERATOR_NAME : name).slice(0, 1)}
    </div>
  );
}

function Banner({ tone, reduce, children }: { tone: "warning" | "success" | "danger"; reduce: boolean; children: ReactNode }) {
  const tones = {
    warning: "bg-warning-soft text-warning",
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <motion.div
      role="status"
      initial={reduce ? false : { height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
      transition={{ duration: 0.24, ease: EASE }}
      className="shrink-0 overflow-hidden border-b border-border"
    >
      <div className={cn("flex items-center gap-2 px-4 py-2 text-xs font-medium", tones[tone])}>{children}</div>
    </motion.div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4 px-4 py-6" aria-busy="true" aria-label="Loading conversation">
      <div className="skeleton h-14 w-3/4 rounded-2xl" />
      <div className="skeleton ml-auto h-9 w-1/2 rounded-2xl" />
      <div className="skeleton h-20 w-4/5 rounded-2xl" />
    </div>
  );
}

function EmptyState({
  agentName,
  businessName,
  onPick,
  disabled,
  reduce,
}: {
  agentName: string;
  businessName: string;
  onPick: (text: string) => void;
  disabled: boolean;
  reduce: boolean;
}) {
  return (
    <div className="flex min-h-full flex-col justify-end px-5 pb-5 pt-10">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle">Front desk, open now</p>
        <h2 className="mt-3 font-display text-[34px] leading-[1.05] text-fg">
          Hi, I am {agentName}.
          <span className="block italic text-fg-muted">How can I help?</span>
        </h2>
        <p className="mt-3 max-w-[36ch] text-[14px] leading-relaxed text-fg-muted">
          Book or move an appointment, check prices, or ask anything about {businessName}. A person from the front desk can step in at any time.
        </p>
      </motion.div>
      <div className="mt-7">
        <p className="mb-2.5 text-2xs font-medium text-fg-subtle">Try asking</p>
        <ul className="flex flex-wrap gap-2">
          {QUICK_REPLIES.map((q, i) => (
            <motion.li
              key={q}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE, delay: reduce ? 0 : 0.12 + i * 0.04 }}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(q)}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-fg-muted transition-[border-color,color,background-color] hover:border-accent/50 hover:bg-accent-soft hover:text-fg disabled:opacity-50"
              >
                {q}
              </button>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CustomerBubble({ text }: { text: string }) {
  return (
    <div className="max-w-[82%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-[15px] leading-relaxed text-accent-fg shadow-sm">
      <span className="sr-only">You: </span>
      <span className="whitespace-pre-wrap break-words">{text}</span>
    </div>
  );
}

function AgentTurn({
  message,
  agentName,
  reduce,
  slotsDisabled,
  onPickSlot,
  onRetry,
  retryDisabled,
}: {
  message: ChatMessage;
  agentName: string;
  reduce: boolean;
  slotsDisabled: boolean;
  onPickSlot: (slot: Extract<Card, { kind: "slots" }>["slots"][number]) => void;
  onRetry: () => void;
  retryDisabled: boolean;
}) {
  const human = message.role === "human";
  const streaming = message.state === "streaming";
  const working = message.tools.some((t) => t.status === "start");
  const showTyping = streaming && !message.content && !working;
  // Retrieval runs on every turn; citations only add meaning on answers, not on actions.

  return (
    <div className="flex w-full max-w-[92%] flex-col gap-2">
      <div className="flex items-center gap-1.5 text-2xs text-fg-subtle">
        <span className={cn("font-medium", human ? "text-success" : "text-fg-muted")}>{human ? OPERATOR_NAME : agentName}</span>
        <span aria-hidden>·</span>
        <span>{human ? "Front desk" : "AI"}</span>
      </div>

      {message.tools.length > 0 ? <ToolRail tools={message.tools} reduce={reduce} /> : null}

      {showTyping ? <TypingIndicator reduce={reduce} /> : null}

      {message.content ? (
        <div
          className={cn(
            "w-fit max-w-full rounded-2xl rounded-tl-md border px-3.5 py-2.5 text-[15px] leading-relaxed",
            human ? "border-success/30 bg-success-soft text-fg" : "border-border bg-surface-2 text-fg",
            message.state === "error" && "border-danger/35 bg-danger-soft",
          )}
        >
          <span className="whitespace-pre-wrap break-words">{message.content.trim()}</span>
          {streaming ? <span aria-hidden className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] animate-pulse bg-accent" /> : null}
        </div>
      ) : null}

      {message.state === "error" ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retryDisabled}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg transition-colors hover:border-border-strong hover:bg-surface-2 disabled:opacity-50"
        >
          <RotateCcw aria-hidden className="size-3" />
          Try again
        </button>
      ) : null}

      {message.cards.map((card, i) => (
        <motion.div
          key={`${card.kind}-${i}`}
          initial={reduce ? false : { opacity: 0, y: 6, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="w-full max-w-[340px]"
        >
          <CardView
            card={card}
            slotsDisabled={slotsDisabled}
            onPickSlot={onPickSlot}
          />
        </motion.div>
      ))}

      {message.sources.length > 0 && !streaming && message.cards.length === 0 ? <Sources sources={message.sources} /> : null}
    </div>
  );
}

function ToolRail({ tools, reduce }: { tools: ToolStep[]; reduce: boolean }) {
  return (
    <ul className="flex flex-col gap-1" aria-label="Actions taken">
      <AnimatePresence initial={false}>
        {tools.map((t) => (
          <motion.li
            key={t.id}
            initial={reduce ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="flex items-center gap-2 text-xs"
          >
            <span
              aria-hidden
              className={cn(
                "grid size-4 place-items-center rounded-full",
                t.status === "start" && "text-accent",
                t.status === "done" && "bg-success-soft text-success",
                t.status === "error" && "bg-danger-soft text-danger",
              )}
            >
              {t.status === "start" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : t.status === "done" ? (
                <Check className="size-2.5" strokeWidth={3} />
              ) : (
                <X className="size-2.5" strokeWidth={3} />
              )}
            </span>
            <span className={cn(t.status === "start" ? "text-fg" : "text-fg-subtle")}>
              {t.label}
              {t.status === "start" ? <span className="sr-only"> in progress</span> : t.status === "error" ? " failed" : null}
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function TypingIndicator({ reduce }: { reduce: boolean }) {
  return (
    <div className="flex w-fit items-center gap-1 rounded-2xl rounded-tl-md border border-border bg-surface-2 px-3.5 py-3" role="status" aria-label="Typing">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          aria-hidden
          className="size-1.5 rounded-full bg-fg-subtle"
          animate={reduce ? undefined : { opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function Sources({ sources }: { sources: SourceRef[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const shown = sources.slice(0, 4);
  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 -mx-1.5 text-[12px] text-fg-subtle transition-colors hover:text-fg"
      >
        Sources: <span className="tabular">{shown.length}</span>
        <ChevronDown aria-hidden className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open ? (
        <ul id={listId} className="flex flex-wrap gap-1.5">
          {shown.map((s) => (
            <li key={s.id}>
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5 text-[12px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
                >
                  <span className="truncate">{s.title}</span>
                  <ExternalLink aria-hidden className="size-2.5 shrink-0 opacity-60" />
                </a>
              ) : (
                <span className="inline-flex max-w-[220px] items-center rounded-md border border-border bg-surface px-1.5 py-0.5 text-[12px] text-fg-muted">
                  <span className="truncate">{s.title}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
