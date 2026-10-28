"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Shows the real host serving this page, so the snippet can be copied and used as is. */
export function EmbedSnippet({ business }: { business: string }) {
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  return (
    <pre className="scroll-quiet overflow-x-auto rounded-2xl border border-border bg-bg p-5 font-mono text-[13px] leading-relaxed">
      <code>
        <span className="text-fg-subtle">{"<"}</span>
        <span className="text-accent">script</span> <span className="text-fg-muted">src</span>
        <span className="text-fg-subtle">=</span>
        <span className="text-success">{`"${origin}/widget.js"`}</span>
        {"\n        "}
        <span className="text-fg-muted">data-business</span>
        <span className="text-fg-subtle">=</span>
        <span className="text-success">{`"${business}"`}</span> <span className="text-fg-muted">async</span>
        <span className="text-fg-subtle">{"></"}</span>
        <span className="text-accent">script</span>
        <span className="text-fg-subtle">{">"}</span>
      </code>
    </pre>
  );
}
