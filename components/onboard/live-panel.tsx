"use client";

import { Check, Copy, MessageSquare, Phone } from "lucide-react";
import QRCode from "qrcode";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Panel } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const noop = () => () => {};

/** The page origin is fixed for the life of the tab; empty during server render. */
function useOrigin(): string {
  return useSyncExternalStore(noop, () => window.location.origin, () => "");
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setFailed(true);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
        copied ? "text-success" : failed ? "text-danger" : "text-fg-muted hover:bg-surface-3 hover:text-fg",
      )}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : failed ? "Copy blocked" : "Copy"}
    </button>
  );
}

export function LivePanel({ slug, agentName, totalMs }: { slug: string; agentName: string; totalMs: number }) {
  const origin = useOrigin();
  const callUrl = origin ? `${origin}/call/${slug}` : "";
  const chatUrl = origin ? `${origin}/chat/${slug}` : "";
  const snippet = `<script src="${origin}/widget.js" data-business="${slug}" async></script>`;
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    if (!callUrl) return;
    let cancelled = false;
    QRCode.toDataURL(callUrl, { margin: 1, width: 360, errorCorrectionLevel: "M", color: { dark: "#08080a", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQrError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [callUrl]);

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="live-dot size-2 rounded-full bg-success" aria-hidden />
          <span className="text-sm font-medium text-fg">{agentName} is live</span>
        </div>
        <span className="font-mono text-xs tabular text-fg-subtle">in {(totalMs / 1000).toFixed(1)}s</span>
      </div>

      <div className="flex gap-5 px-5 py-5">
        <div className="grid size-[132px] shrink-0 place-items-center overflow-hidden rounded-lg bg-white p-1.5">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL QR code gains nothing from next/image
            <img src={qr} alt={`QR code to call ${agentName}`} className="size-full" />
          ) : qrError ? (
            <span className="px-2 text-center text-2xs text-zinc-500">QR unavailable</span>
          ) : (
            <span className="skeleton size-full" aria-hidden />
          )}
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-2">
          <p className="text-[13px] leading-relaxed text-fg-muted">Scan to talk to {agentName} on your phone, or open the chat.</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/call/${slug}`}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-fg shadow-[0_1px_0_rgb(255_255_255/0.25)_inset] transition-colors hover:bg-accent-strong"
            >
              <Phone className="size-4" /> Call
            </Link>
            <Link
              href={`/chat/${slug}`}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3.5 text-sm font-medium text-fg transition-colors hover:border-border-strong hover:bg-surface-3"
            >
              <MessageSquare className="size-4" /> Chat
            </Link>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
        {[
          { label: "Call link", value: callUrl },
          { label: "Chat link", value: chatUrl },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-fg-subtle">{row.label}</div>
              <div className="truncate font-mono text-[13px] text-fg">{row.value.replace(/^https?:\/\//, "") || <span className="skeleton inline-block h-3 w-40" />}</div>
            </div>
            <CopyButton value={row.value} label={`Copy ${row.label.toLowerCase()}`} />
          </div>
        ))}
      </div>

      <div className="border-t border-border px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs text-fg-subtle">Embed on any website</div>
          <CopyButton value={snippet} label="Copy embed snippet" />
        </div>
        <pre className="scroll-quiet overflow-x-auto rounded-lg border border-border bg-bg-subtle px-3 py-2.5 font-mono text-xs leading-relaxed text-fg-muted">
          <code>{snippet}</code>
        </pre>
      </div>
    </Panel>
  );
}
