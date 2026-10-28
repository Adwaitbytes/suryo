"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const CHAT_FALLBACK = "/chat/saanjh";

/** Opens the embedded Suryo widget with a drafted message, or the full chat page when the widget is not on the page. */
export function AskMeera({ message, className, children }: { message: string; className?: string; children: ReactNode }) {
  const open = () => {
    if (document.querySelector("div[data-suryo-widget]")) {
      window.dispatchEvent(new CustomEvent("suryo:open", { detail: { message } }));
    } else {
      window.open(CHAT_FALLBACK, "_blank", "noopener");
    }
  };
  return (
    <button type="button" onClick={open} className={cn("cursor-pointer", className)}>
      {children}
    </button>
  );
}
