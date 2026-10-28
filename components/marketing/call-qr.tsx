"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** QR for a path on the current origin, so it works on localhost, a LAN IP or the deployed host alike. */
/**
 * "inverted" draws the modules in the foreground colour straight onto the card surface: light on dark in the dark theme
 * (phone cameras read either polarity), dark on light in the light theme.
 */
type QrTone = "paper" | "inverted";

// A sentinel the library can parse, swapped for currentColor so the modules follow the theme.
const INVERTED_MODULE = "#010203";

const QR_COLORS: Record<QrTone, { dark: string; light: string }> = {
  paper: { dark: "#0b0b0d", light: "#ffffff" },
  inverted: { dark: INVERTED_MODULE, light: "#00000000" },
};

export function CallQr({
  path,
  className,
  codeClassName,
  label,
  tone = "paper",
}: {
  path: string;
  className?: string;
  codeClassName?: string;
  label: string;
  tone?: QrTone;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [url, setUrl] = useState<string>("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const target = new URL(path, window.location.origin).toString();
    let active = true;
    QRCode.toString(target, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: QR_COLORS[tone] })
      .then((markup) => {
        if (!active) return;
        setSvg(tone === "inverted" ? markup.replaceAll(INVERTED_MODULE, "currentColor") : markup);
        setUrl(target);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [path, tone]);

  return (
    <figure className={cn("flex flex-col items-center", className)}>
      <div
        className={cn(
          "aspect-square w-full rounded-2xl",
          codeClassName,
          tone === "paper" ? "bg-white p-[9%] shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_30px_60px_-24px_rgb(0_0_0/0.7)]" : "bg-surface-2 p-3.5 text-fg",
        )}
      >
        {svg ? (
          <div role="img" aria-label={`${label}: ${url}`} className="size-full [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : failed ? (
          <div className={cn("grid size-full place-items-center text-center text-xs", tone === "paper" ? "text-zinc-500" : "text-fg-subtle")}>QR unavailable. Open {path}</div>
        ) : (
          <div aria-hidden className={cn("size-full animate-pulse rounded-lg", tone === "paper" ? "bg-zinc-100" : "bg-surface-3")} />
        )}
      </div>
      <figcaption className="mt-3 max-w-full truncate font-mono text-[11px] text-fg-subtle">{url ? url.replace(/^https?:\/\//, "") : path}</figcaption>
    </figure>
  );
}
