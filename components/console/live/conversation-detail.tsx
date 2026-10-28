"use client";

import { ArrowUp, CheckCheck, Hand, RefreshCw, Sparkles, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SuryoMark } from "@/components/marketing/brand";
import { Kbd } from "@/components/ui/primitives";
import type { ConversationDetail } from "@/lib/console/types";
import { cn } from "@/lib/utils";
import { errorMessage, sendJson } from "../api";
import { ChannelIcon, LanguageChip, StatusChip } from "../bits";
import { elapsed, formatClock } from "../format";
import { useConsole } from "../provider";
import { Transcript } from "./transcript";

type Busy = "takeover" | "handback" | "resolve" | null;

export function ConversationPane({ detail, now, onChanged, agentName }: { detail: ConversationDetail; now: number; onChanged: () => Promise<void> | void; agentName: string }) {
  const { toast, operator } = useConsole();
  const [busy, setBusy] = useState<Busy>(null);
  const { conversation: c, customer } = detail;
  const customerLabel = customer?.name ?? (c.channel === "voice" ? "Unknown caller" : "Website visitor");
  const ended = c.status === "resolved" || c.status === "abandoned";

  const act = useCallback(
    async (action: Exclude<Busy, null>) => {
      setBusy(action);
      try {
        await sendJson(`/api/console/${action}`, { conversationId: c.id, operator });
        await onChanged();
        if (action === "takeover") toast({ title: "You have the conversation", body: "The assistant is paused. Replies you send appear in the customer's window.", tone: "success" });
        if (action === "handback") toast({ title: "Handed back to the assistant", tone: "success" });
        if (action === "resolve") toast({ title: "Marked resolved", body: "A summary is being written for the record.", tone: "success" });
      } catch (err) {
        toast({ title: "That did not go through", body: errorMessage(err), tone: "danger" });
      } finally {
        setBusy(null);
      }
    },
    [c.id, onChanged, operator, toast],
  );

  return (
    <section aria-label="Conversation" className="flex min-h-0 min-w-0 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-6 2xl:px-8">
        <ChannelIcon channel={c.channel} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold tracking-tight">{customerLabel}</h2>
            <StatusChip status={c.status} />
            <LanguageChip language={c.language} />
          </div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-fg-subtle">
            {customer?.phone ? <span>{customer.phone}</span> : null}
            {customer?.email ? <span>{customer.email}</span> : null}
            <span>
              {c.channel === "voice" ? "call" : "chat"} started {formatClock(c.startedAt)}
            </span>
            {!ended ? <span className="tabular">· {elapsed(c.startedAt, now)}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {c.status === "human" ? (
            <Button size="sm" variant="secondary" onClick={() => act("handback")} disabled={busy !== null}>
              <Undo2 aria-hidden className="size-3.5" />
              {busy === "handback" ? "Handing back" : "Hand back to AI"}
            </Button>
          ) : null}
          {!ended ? (
            <Button size="sm" variant="ghost" onClick={() => act("resolve")} disabled={busy !== null}>
              <CheckCheck aria-hidden className="size-3.5" />
              {busy === "resolve" ? "Resolving" : "Resolve"}
            </Button>
          ) : null}
          {!ended && c.status !== "human" ? (
            <Button size="sm" variant="primary" onClick={() => act("takeover")} disabled={busy !== null}>
              <Hand aria-hidden className="size-3.5" />
              {busy === "takeover" ? "Taking over" : "Take over"}
            </Button>
          ) : null}
        </div>
      </header>

      {detail.messages.length ? (
        <Transcript messages={detail.messages} customerLabel={customerLabel} agentName={agentName} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-[13px] text-fg-subtle">The transcript fills in as soon as the customer speaks.</div>
      )}

      <Composer detail={detail} onSent={onChanged} onTakeOver={() => act("takeover")} busy={busy === "takeover"} />
    </section>
  );
}

function Composer({ detail, onSent, onTakeOver, busy }: { detail: ConversationDetail; onSent: () => Promise<void> | void; onTakeOver: () => void; busy: boolean }) {
  const { toast, operator } = useConsole();
  const { conversation: c } = detail;
  const [text, setText] = useState("");
  const [fromDraft, setFromDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [drafts, setDrafts] = useState<string[] | null>(null);
  const [draftsState, setDraftsState] = useState<"idle" | "loading" | "error">("idle");
  const draftKey = useRef<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const human = c.status === "human";
  const lastCustomer = [...detail.messages].reverse().find((m) => m.role === "customer")?.id ?? null;

  const loadDrafts = useCallback(async () => {
    setDraftsState("loading");
    try {
      const { replies } = await sendJson<{ replies: string[] }>("/api/console/suggest", { conversationId: c.id, operator });
      setDrafts(replies);
      setDraftsState("idle");
    } catch {
      setDraftsState("error");
    }
  }, [c.id, operator]);

  // Fresh drafts whenever the customer says something new while a human owns the conversation.
  useEffect(() => {
    if (!human) {
      draftKey.current = null;
      return;
    }
    const key = `${c.id}:${lastCustomer}`;
    if (draftKey.current === key) return;
    draftKey.current = key;
    void loadDrafts();
  }, [human, c.id, lastCustomer, loadDrafts]);

  useEffect(() => {
    if (human) field.current?.focus();
  }, [human]);

  const applyDraft = useCallback((draft: string) => {
    setText(draft);
    setFromDraft(true);
    field.current?.focus();
  }, []);

  // Alt+1..3 inserts a suggestion from anywhere, including mid sentence in the composer.
  useEffect(() => {
    if (!human || !drafts?.length) return;
    const onKey = (e: KeyboardEvent) => {
      const match = /^Digit([1-3])$/.exec(e.code);
      if (!match || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const draft = drafts[Number(match[1]) - 1];
      if (!draft) return;
      e.preventDefault();
      applyDraft(draft);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [human, drafts, applyDraft]);

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await sendJson("/api/console/reply", { conversationId: c.id, operator, content, suggested: fromDraft });
      setText("");
      setFromDraft(false);
      await onSent();
    } catch (err) {
      toast({ title: "Message not sent", body: errorMessage(err), tone: "danger" });
    } finally {
      setSending(false);
    }
  };

  if (c.status === "resolved" || c.status === "abandoned") {
    return (
      <div className="shrink-0 border-t border-border px-6 py-4 text-center text-[13px] text-fg-subtle">
        This conversation has ended{c.status === "abandoned" ? " without a resolution. A recovery follow up is scheduled when the customer is known." : "."}
      </div>
    );
  }

  if (!human) {
    return (
      <div className="flex shrink-0 items-center gap-4 border-t border-border bg-bg-subtle px-6 py-4 2xl:px-8">
        <span className="grid size-8 place-items-center rounded-lg bg-surface-2">
          <SuryoMark className="size-[18px]" />
        </span>
        <div className="flex-1">
          <div className="text-[13px] text-fg">The assistant is handling this {c.channel === "voice" ? "call" : "chat"}</div>
          <div className="text-xs text-fg-subtle">Take over to pause it and reply as {operator}. You can hand it back at any time.</div>
        </div>
        <Button variant="primary" onClick={onTakeOver} disabled={busy}>
          <Hand aria-hidden className="size-4" />
          {busy ? "Taking over" : "Take over"}
        </Button>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-border bg-bg-subtle px-6 pt-3 pb-4 2xl:px-8">
      <div className="mx-auto max-w-[760px]">
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.08em] text-fg-subtle">
            <Sparkles aria-hidden className="size-3 text-accent" /> Suggested replies
          </span>
          {draftsState === "error" ? <span className="text-xs text-fg-subtle">Unavailable right now</span> : null}
          <button
            type="button"
            onClick={() => void loadDrafts()}
            disabled={draftsState === "loading"}
            className="ml-auto inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 text-2xs text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-40"
          >
            <RefreshCw aria-hidden className={cn("size-3", draftsState === "loading" && "animate-spin")} />
            Rewrite
          </button>
        </div>
        <div className="mb-2.5 flex flex-col">
          {draftsState === "loading" ? (
            [0, 1, 2].map((i) => <span key={i} className="skeleton my-1 h-6 rounded-md" style={{ width: `${92 - i * 14}%` }} />)
          ) : (
            <AnimatePresence initial={false}>
              {drafts?.slice(0, 3).map((d, i) => (
                <motion.button
                  key={d}
                  type="button"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
                  onClick={() => applyDraft(d)}
                  className="group/draft flex h-8 w-full items-center gap-2.5 rounded-md px-3 text-left text-[12.5px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:bg-surface-2 focus-visible:text-fg"
                  title={`${d} (Alt+${i + 1})`}
                  aria-keyshortcuts={`Alt+${i + 1}`}
                >
                  <Kbd className="shrink-0 group-hover/draft:border-accent/40 group-hover/draft:text-accent">{i + 1}</Kbd>
                  <span className="truncate">{d}</span>
                </motion.button>
              ))}
            </AnimatePresence>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-end gap-2 rounded-xl border border-border-strong bg-surface p-2 shadow-sm transition-[border-color,box-shadow] duration-150 focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent-soft"
        >
          <label htmlFor="operator-reply" className="sr-only">
            Reply as {operator}
          </label>
          <textarea
            id="operator-reply"
            ref={field}
            value={text}
            rows={2}
            onChange={(e) => {
              setText(e.target.value);
              if (!e.target.value) setFromDraft(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={`Reply as ${operator}`}
            className="scroll-quiet max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] leading-relaxed text-fg outline-none placeholder:text-fg-faint focus-visible:outline-none"
          />
          <Button type="submit" variant="primary" size="icon" disabled={!text.trim() || sending} aria-label="Send reply">
            <ArrowUp aria-hidden className="size-4" />
          </Button>
        </form>
        <div className="mt-1.5 flex items-center gap-3 px-1 text-2xs text-fg-faint">
          <span>
            <Kbd>↵</Kbd> send · <Kbd>⇧</Kbd>
            <Kbd>↵</Kbd> new line
          </span>
          <span className="ml-auto">The assistant stays silent while you own this conversation</span>
        </div>
      </div>
    </div>
  );
}
