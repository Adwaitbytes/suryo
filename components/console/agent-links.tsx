"use client";

import { Check, Code2, Copy, MessageSquare, Phone, QrCode } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { CallQr } from "@/components/marketing/call-qr";
import { cn } from "@/lib/utils";
import { Popover } from "./popover";
import { useConsole } from "./provider";

/** Absolute URL for a path on the current host, so links work on localhost and production alike. */
const noop = () => () => {};
function useOrigin(): string {
  return useSyncExternalStore(noop, () => window.location.origin, () => "");
}

function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const { toast } = useConsole();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Could not copy", body: "Select the text and copy it manually.", tone: "danger" });
    }
  };
  return (
    <div className="min-w-0">
      <div className="mb-1 text-2xs font-medium uppercase tracking-[0.08em] text-fg-subtle">{label}</div>
      <div className="flex items-center gap-1.5">
        <code className={cn("min-w-0 flex-1 truncate rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[11.5px] text-fg-muted", mono && "font-mono")}>{value}</code>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="grid size-7 shrink-0 place-items-center rounded-md border border-border text-fg-subtle transition-colors hover:border-border-strong hover:text-fg"
        >
          {copied ? <Check aria-hidden className="size-3.5 text-success" /> : <Copy aria-hidden className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

/**
 * Every business gets the same three ways in: a call link, a chat link and a one tag embed.
 * Shown for whichever business is selected, including ones onboarded a minute ago.
 */
export function AgentLinksPanel({ className }: { className?: string }) {
  const { business } = useConsole();
  const origin = useOrigin();
  if (!business) return null;
  const call = `/call/${business.slug}`;
  const chat = `/chat/${business.slug}`;
  const embed = `<script src="${origin}/widget.js" data-business="${business.slug}" async></script>`;
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-start gap-4">
        <CallQr path={call} tone="inverted" label={`Call ${business.agentName}`} className="w-28 shrink-0 [&_figcaption]:hidden" codeClassName="p-2.5" />
        <div className="min-w-0 pt-1">
          <div className="text-[13px] font-medium text-fg">Talk to {business.agentName}</div>
          <p className="mt-1 text-[12px] leading-relaxed text-fg-subtle">Scan to call from a phone, or open the call and chat here.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={call}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12.5px] font-medium text-accent-fg transition-colors hover:bg-accent-strong"
            >
              <Phone aria-hidden className="size-3.5" />
              Call
            </a>
            <a
              href={chat}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-[12.5px] font-medium text-fg transition-colors hover:border-border-strong"
            >
              <MessageSquare aria-hidden className="size-3.5" />
              Chat
            </a>
          </div>
        </div>
      </div>
      <CopyRow label="Call link" value={`${origin}${call}`} />
      <CopyRow label="Chat link" value={`${origin}${chat}`} />
      <CopyRow label="Embed on any website" value={embed} />
    </div>
  );
}

/** Compact sidebar entry point that opens the links panel in a popover. */
export function AgentLinksButton() {
  const { business } = useConsole();
  const [open, setOpen] = useState(false);
  if (!business) return null;
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      className="w-[340px] p-4"
      trigger={
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <a
            href={`/call/${business.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-accent-soft text-[12px] font-medium text-accent transition-colors hover:bg-accent hover:text-accent-fg"
          >
            <Phone aria-hidden className="size-3.5" />
            Call
          </a>
          <a
            href={`/chat/${business.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border text-[12px] font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
          >
            <MessageSquare aria-hidden className="size-3.5" />
            Chat
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border text-[12px] font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
          >
            {open ? <Code2 aria-hidden className="size-3.5" /> : <QrCode aria-hidden className="size-3.5" />}
            Share
          </button>
        </div>
      }
    >
      <AgentLinksPanel />
    </Popover>
  );
}
