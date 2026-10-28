"use client";

import { ArrowRight, Building2, ClipboardCheck, ExternalLink, FlaskConical, MessageSquare, Moon, Phone, RotateCcw, Search, Send, Sparkles, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Kbd } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useResetDemo, useRunFollowUps, useTheme } from "./actions";
import { navFor } from "./nav";
import { useConsole } from "./provider";

type Command = {
  id: string;
  group: "Navigate" | "Actions" | "Open" | "Business";
  label: string;
  icon: LucideIcon;
  keys?: string[];
  hint?: string;
  /** Destructive commands need a second Enter. */
  confirm?: string;
  run: () => void;
};

/** Remounted with a fresh key each time it opens, so the query and selection always start clean. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { businesses, business, selectBusiness } = useConsole();
  const { toggle, theme } = useTheme();
  const { reset } = useResetDemo();
  const { run: runFollowUps } = useRunFollowUps();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [armed, setArmed] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const slug = business?.slug ?? "kesar";
    const openTab = (href: string) => window.open(href, "_blank", "noopener");
    return [
      ...navFor(business?.kind).map<Command>((n) => ({ id: `nav:${n.href}`, group: "Navigate", label: n.label, icon: n.icon, keys: ["G", n.shortcut.toUpperCase()], run: () => router.push(n.href) })),
      { id: "act:reset", group: "Actions", label: "Reset demo", icon: RotateCcw, confirm: "Press Enter again to reset all demo data", run: () => void reset() },
      { id: "act:theme", group: "Actions", label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme", icon: Moon, run: toggle },
      { id: "act:followups", group: "Actions", label: "Run follow up delivery now", icon: Send, run: () => void runFollowUps() },
      { id: "open:call", group: "Open", label: "Call screen", hint: `/call/${slug}`, icon: Phone, run: () => openTab(`/call/${slug}`) },
      { id: "open:chat", group: "Open", label: "Customer chat", hint: `/chat/${slug}`, icon: MessageSquare, run: () => openTab(`/chat/${slug}`) },
      { id: "open:onboard", group: "Open", label: "Onboard a business", hint: "/onboard", icon: Sparkles, run: () => openTab("/onboard") },
      { id: "open:evals", group: "Open", label: "Evaluation suite", hint: "/evals", icon: FlaskConical, run: () => openTab("/evals") },
      ...businesses.map<Command>((b) => ({
        id: `biz:${b.id}`,
        group: "Business",
        label: b.name,
        hint: b.id === business?.id ? "Current" : b.slug,
        icon: b.id === business?.id ? ClipboardCheck : Building2,
        run: () => selectBusiness(b.id),
      })),
    ];
  }, [business, businesses, router, reset, runFollowUps, selectBusiness, theme, toggle]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.group} ${c.label} ${c.hint ?? ""}`.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const execute = (cmd: Command | undefined) => {
    if (!cmd) return;
    if (cmd.confirm && armed !== cmd.id) {
      setArmed(cmd.id);
      return;
    }
    onClose();
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(filtered.length - 1, i + 1));
      setArmed(null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
      setArmed(null);
    } else if (e.key === "Enter") {
      e.preventDefault();
      execute(filtered[index]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = "";
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 px-4 pt-[14vh] backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          onPointerDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[600px] overflow-hidden rounded-2xl border border-border-strong bg-surface-2 shadow-lg"
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search aria-hidden className="size-4 text-fg-subtle" />
              <input
                ref={input}
                autoFocus
                style={{ outline: "none" }}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIndex(0);
                  setArmed(null);
                }}
                placeholder="Search commands, pages and businesses"
                className="h-13 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-faint"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-list"
                aria-activedescendant={filtered[index] ? `cmd-${filtered[index].id}` : undefined}
              />
              <Kbd>Esc</Kbd>
            </div>
            <div ref={list} id="command-list" role="listbox" className="scroll-quiet max-h-[min(440px,60vh)] overflow-y-auto p-1.5">
              {filtered.length === 0 ? <div className="px-3 py-8 text-center text-sm text-fg-subtle">No commands match &ldquo;{query}&rdquo;</div> : null}
              {filtered.map((cmd, i) => {
                const header = cmd.group !== lastGroup ? cmd.group : null;
                lastGroup = cmd.group;
                const Icon = cmd.icon;
                const active = i === index;
                const isArmed = armed === cmd.id;
                return (
                  <div key={cmd.id}>
                    {header ? <div className="px-2.5 pt-2.5 pb-1 text-2xs font-medium uppercase tracking-[0.08em] text-fg-faint">{header}</div> : null}
                    <div
                      id={`cmd-${cmd.id}`}
                      role="option"
                      aria-selected={active}
                      data-index={i}
                      onPointerMove={() => index !== i && setIndex(i)}
                      onClick={() => execute(cmd)}
                      className={cn(
                        "flex h-10 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-[13.5px] text-fg-muted",
                        active && "bg-surface-3 text-fg",
                        isArmed && "bg-danger-soft text-danger",
                      )}
                    >
                      <Icon aria-hidden className={cn("size-4 shrink-0", isArmed ? "text-danger" : active ? "text-fg" : "text-fg-subtle")} />
                      <span className="flex-1 truncate">{isArmed ? cmd.confirm : cmd.label}</span>
                      {cmd.hint && !isArmed ? <span className="font-mono text-2xs text-fg-faint">{cmd.hint}</span> : null}
                      {cmd.group === "Open" && !isArmed ? <ExternalLink aria-hidden className="size-3.5 text-fg-faint" /> : null}
                      {cmd.keys ? (
                        <span className="flex gap-1">
                          {cmd.keys.map((k) => (
                            <Kbd key={k}>{k}</Kbd>
                          ))}
                        </span>
                      ) : null}
                      {active && !cmd.keys && cmd.group !== "Open" ? <ArrowRight aria-hidden className="size-3.5 text-fg-faint" /> : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 border-t border-border px-4 py-2.5 text-2xs text-fg-faint">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> to move
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd> to run
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <Kbd>G</Kbd> then a letter jumps to a page
              </span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
