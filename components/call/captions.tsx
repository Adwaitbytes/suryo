"use client";

import { AnimatePresence, motion } from "motion/react";
import type { Caption } from "@/lib/voice/call";
import { cn } from "@/lib/utils";

type Props = {
  captions: Caption[];
  agentName: string;
  humanName: string;
  reducedMotion: boolean;
  emptyText: string;
  limit?: number;
};

/** Live captions of both sides. Always on: the call has to work for callers who cannot hear it well. */
export function Captions({ captions, agentName, humanName, reducedMotion, emptyText, limit = 3 }: Props) {
  const visible = captions.filter((c) => c.text.trim()).slice(-limit);
  return (
    <div role="log" aria-live="polite" aria-label="Live captions" className="flex min-h-[7.5rem] flex-col justify-end gap-2.5">
      {visible.length === 0 ? (
        <p className="text-[15px] leading-relaxed text-fg-subtle">{emptyText}</p>
      ) : (
        <AnimatePresence initial={false}>
          {visible.map((caption, index) => {
            const latest = index === visible.length - 1;
            const who = caption.role === "agent" ? agentName : caption.role === "human" ? humanName : "You";
            return (
              <motion.p
                key={caption.id}
                layout={reducedMotion ? false : "position"}
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: latest ? 1 : index === visible.length - 2 ? 0.62 : 0.36, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "text-pretty leading-relaxed",
                  latest ? "text-[17px]" : "text-[15px]",
                  caption.role === "customer" ? "text-fg-muted" : "text-fg",
                )}
              >
                <span
                  className={cn(
                    "mr-2 text-[13px] font-medium",
                    caption.role === "agent" ? "text-accent" : caption.role === "human" ? "text-success" : "text-fg-subtle",
                  )}
                >
                  {who}
                </span>
                {caption.text.trim()}
                {caption.interrupted ? <span className="text-fg-subtle">...</span> : null}
              </motion.p>
            );
          })}
        </AnimatePresence>
      )}
    </div>
  );
}
