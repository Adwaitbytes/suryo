"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** QR for a path on the current origin, so it works on localhost, a LAN IP or the deployed host alike. */
export function CallQr({ path, className, label }: { path: string; className?: string; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [url, setUrl] = useState<string>("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const target = new URL(path, window.location.origin).toString();
    let active = true;
    QRCode.toString(target, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0b0b0d", light: "#ffffff" } })
      .then((markup) => {
        if (!active) return;
        setSvg(markup);
        setUrl(target);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [path]);

  return (
    <figure className={cn("flex flex-col items-center", className)}>
      <div className="aspect-square w-full rounded-2xl bg-white p-[9%] shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_30px_60px_-24px_rgb(0_0_0/0.7)]">
        {svg ? (
          <div role="img" aria-label={`${label}: ${url}`} className="size-full [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : failed ? (
          <div className="grid size-full place-items-center text-center text-xs text-zinc-500">QR unavailable. Open {path}</div>
        ) : (
          <div aria-hidden className="size-full animate-pulse rounded-lg bg-zinc-100" />
        )}
      </div>
      <figcaption className="mt-3 max-w-full truncate font-mono text-[11px] text-fg-subtle">{url ? url.replace(/^https?:\/\//, "") : path}</figcaption>
    </figure>
  );
}
