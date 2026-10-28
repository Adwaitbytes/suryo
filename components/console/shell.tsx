"use client";

import { Check, ChevronsUpDown, Command, Moon, Plus, RotateCcw, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useResetDemo, useTheme } from "./actions";
import { CommandPalette } from "./command-palette";
import { isActive, NAV } from "./nav";
import { Popover } from "./popover";
import { ConsoleProvider, useConsole } from "./provider";
import { Toaster } from "./toaster";

export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <ConsoleProvider>
      <ShellFrame>{children}</ShellFrame>
    </ConsoleProvider>
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function ShellFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteKey, setPaletteKey] = useState(0);
  const openPalette = useCallback(() => {
    setPaletteKey((k) => k + 1);
    setPaletteOpen(true);
  }, []);
  const leader = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (paletteOpen) setPaletteOpen(false);
        else openPalette();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || paletteOpen) return;
      const key = e.key.toLowerCase();
      if (leader.current && Date.now() - leader.current < 1200) {
        leader.current = null;
        const target = NAV.find((n) => n.shortcut === key);
        if (target) {
          e.preventDefault();
          router.push(target.href);
        }
        return;
      }
      if (key === "g") leader.current = Date.now();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, paletteOpen, openPalette]);

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-bg text-fg">
      <Sidebar onOpenPalette={openPalette} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      <CommandPalette key={paletteKey} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toaster />
    </div>
  );
}

function Sidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const { snapshot } = useConsole();
  const openEscalations = snapshot?.escalations.filter((e) => e.status === "open").length ?? 0;
  const live = snapshot?.conversations.filter((c) => c.status === "active" || c.status === "escalated" || c.status === "human").length ?? 0;

  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-border bg-bg-subtle 2xl:w-[256px]">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <Mark />
        <span className="text-[15px] font-semibold tracking-tight">Suryo</span>
        <span className="rounded-md border border-border px-1.5 py-px font-mono text-[10px] text-fg-subtle">console</span>
      </div>
      <div className="px-3">
        <BusinessSwitcher />
      </div>
      <button
        type="button"
        onClick={onOpenPalette}
        className="mx-3 mt-3 flex h-8 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-[13px] text-fg-subtle transition-colors hover:border-border-strong hover:text-fg-muted"
      >
        <Command aria-hidden className="size-3.5" />
        <span className="flex-1 text-left">Jump to</span>
        <Kbd>⌘K</Kbd>
      </button>
      <nav aria-label="Console" className="mt-4 flex flex-col gap-px px-2">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          const count = item.href === "/console/escalations" ? openEscalations : item.href === "/console" ? live : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors",
                active ? "bg-surface-2 text-fg shadow-sm" : "text-fg-muted hover:bg-surface hover:text-fg",
              )}
            >
              <Icon aria-hidden className={cn("size-4", active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")} />
              <span className="flex-1">{item.label}</span>
              {count > 0 ? (
                <span
                  className={cn(
                    "tabular min-w-5 rounded-md px-1.5 text-center text-2xs font-semibold leading-5",
                    item.href === "/console/escalations" ? "bg-danger text-white" : "bg-surface-3 text-fg-muted",
                  )}
                  aria-label={`${count} ${item.href === "/console/escalations" ? "open escalations" : "live conversations"}`}
                >
                  {count}
                </span>
              ) : (
                <span className="font-mono text-[10px] text-fg-faint opacity-0 transition-opacity group-hover:opacity-100">G {item.shortcut.toUpperCase()}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-2 border-t border-border p-3">
        <StreamStatus />
        <div className="flex items-center gap-2">
          <ResetDemo />
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

function Mark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6">
      <defs>
        <radialGradient id="suryo-sun" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="var(--accent-strong)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx="7" fill="var(--surface-3)" />
      <circle cx="12" cy="13.5" r="5" fill="url(#suryo-sun)" />
      <rect x="4" y="16" width="16" height="1.6" rx="0.8" fill="var(--bg-subtle)" />
    </svg>
  );
}

function BusinessSwitcher() {
  const { businesses, business, selectBusiness } = useConsole();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <Popover
      open={open}
      onClose={close}
      className="w-full"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-surface"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent-soft text-[13px] font-semibold text-accent">{business?.name.slice(0, 1) ?? ""}</span>
          <span className="min-w-0 flex-1">
            {business ? (
              <>
                <span className="block truncate text-[13px] font-medium text-fg">{business.name}</span>
                <span className="block truncate font-mono text-[10.5px] text-fg-subtle">/{business.slug}</span>
              </>
            ) : (
              <span className="block space-y-1.5">
                <span className="skeleton block h-3 w-28" />
                <span className="skeleton block h-2.5 w-14" />
              </span>
            )}
          </span>
          <ChevronsUpDown aria-hidden className="size-3.5 text-fg-faint" />
        </button>
      }
    >
      <div className="px-2 pt-1.5 pb-1 text-2xs font-medium uppercase tracking-[0.08em] text-fg-faint">Businesses</div>
      {businesses.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => {
            selectBusiness(b.id);
            close();
          }}
          className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] text-fg-muted hover:bg-surface-3 hover:text-fg"
        >
          <span className="grid size-5 place-items-center rounded bg-surface-3 text-[10.5px] font-semibold text-fg-muted">{b.name.slice(0, 1)}</span>
          <span className="flex-1 truncate">{b.name}</span>
          {b.isDemo ? <span className="font-mono text-[10px] text-fg-faint">demo</span> : null}
          {b.id === business?.id ? <Check aria-hidden className="size-3.5 text-accent" /> : null}
        </button>
      ))}
      <div className="my-1 h-px bg-border" />
      <a href="/onboard" className="flex h-9 items-center gap-2.5 rounded-lg px-2 text-[13px] text-fg-muted hover:bg-surface-3 hover:text-fg">
        <Plus aria-hidden className="size-4 text-fg-subtle" />
        Onboard a business
      </a>
    </Popover>
  );
}

function StreamStatus() {
  const { streamMode } = useConsole();
  const meta = {
    live: { label: "Live", detail: "Streaming events", dot: "bg-success" },
    polling: { label: "Polling", detail: "Stream unavailable, refreshing every 3s", dot: "bg-warning" },
    connecting: { label: "Connecting", detail: "Opening event stream", dot: "bg-fg-faint" },
  }[streamMode];
  return (
    <div className="flex items-center gap-2 px-1 text-xs" title={meta.detail}>
      <span className={cn("size-1.5 rounded-full", meta.dot, streamMode === "live" && "live-dot")} aria-hidden />
      <span className="text-fg-muted">{meta.label}</span>
      <span className="truncate text-fg-faint">{meta.detail}</span>
    </div>
  );
}

function ResetDemo() {
  const { reset, pending } = useResetDemo();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <Popover
      open={open}
      onClose={close}
      side="top"
      className="w-64 p-3"
      trigger={
        <Button size="sm" variant="secondary" className="w-[150px] 2xl:w-[174px]" onClick={() => setOpen((o) => !o)} disabled={pending} aria-expanded={open}>
          <RotateCcw aria-hidden className={cn("size-3.5", pending && "animate-spin [animation-direction:reverse]")} />
          {pending ? "Resetting" : "Reset demo"}
        </Button>
      }
    >
      <div className="text-[13px] font-medium text-fg">Reset the demo business?</div>
      <p className="mt-1 text-xs leading-relaxed text-fg-subtle">Clears live conversations and restores seeded slots, bookings and history. Takes a few seconds.</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          autoFocus
          onClick={() => {
            close();
            void reset();
          }}
        >
          Reset now
        </Button>
      </div>
    </Popover>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button size="sm" variant="ghost" className="ml-auto size-7 px-0" onClick={toggle} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
      {theme === "dark" ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
    </Button>
  );
}
