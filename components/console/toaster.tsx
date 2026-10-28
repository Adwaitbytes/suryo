"use client";

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useConsole } from "./provider";

export function Toaster() {
  const { toasts, dismissToast } = useConsole();
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-5 bottom-5 z-[60] flex w-[360px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = t.tone === "danger" ? CircleAlert : t.tone === "success" ? CheckCircle2 : Info;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
              transition={{ type: "spring", stiffness: 500, damping: 36 }}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border-strong bg-surface-2 px-3.5 py-3 shadow-lg"
            >
              <Icon
                aria-hidden
                className={cn("mt-0.5 size-4 shrink-0", t.tone === "danger" ? "text-danger" : t.tone === "success" ? "text-success" : "text-fg-subtle")}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-fg">{t.title}</div>
                {t.body ? <div className="mt-0.5 text-xs leading-relaxed text-fg-subtle">{t.body}</div> : null}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="-mr-1 grid size-6 place-items-center rounded-md text-fg-faint hover:bg-surface-3 hover:text-fg"
                aria-label="Dismiss"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
