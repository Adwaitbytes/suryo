"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { cn, formatInr } from "@/lib/utils";
import { formatLatency, formatPercent, SuryoMark } from "./brand";
import { CallQr } from "./call-qr";
import type { LiveSnapshot } from "./live";

const W = 1920;
const H = 1080;
const EASE = [0.22, 1, 0.36, 1] as const;

export function PitchDeck({ live }: { live: LiveSnapshot }) {
  const slides = [
    { id: "problem", render: () => <Problem /> },
    { id: "how", render: () => <How /> },
    { id: "demo", render: () => <Demo live={live} /> },
    { id: "impact", render: () => <Impact live={live} /> },
    { id: "next", render: () => <Next /> },
  ];
  const count = slides.length;
  const [{ index, dir }, setPosition] = useState({ index: 0, dir: 1 });
  const [scale, setScale] = useState(1);
  const reduce = useReducedMotion() ?? false;

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(count - 1, next));
      setPosition((current) => ({ index: clamped, dir: clamped >= current.index ? 1 : -1 }));
      window.history.replaceState(null, "", `#${clamped + 1}`);
    },
    [count],
  );

  // Deep links like /pitch#3 survive a reload mid presentation; the hash is read after hydration.
  useEffect(() => {
    const sync = () => {
      const fromHash = Number.parseInt(window.location.hash.slice(1), 10);
      if (Number.isFinite(fromHash)) go(fromHash - 1);
    };
    const frame = requestAnimationFrame(sync);
    window.addEventListener("hashchange", sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", sync);
    };
  }, [go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        go(index + 1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === "Home") go(0);
      else if (e.key === "End") go(count - 1);
      else if (/^[1-9]$/.test(e.key)) go(Number(e.key) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, count]);

  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const slide = slides[index];

  return (
    <div className="fixed inset-0 grid place-items-center overflow-hidden bg-black">
      <section
        aria-roledescription="slide deck"
        aria-label="Suryo pitch"
        className="relative shrink-0 overflow-hidden bg-bg text-fg"
        style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "center" }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_45%_at_85%_0%,rgb(255_122_48/0.09),transparent_70%)]" />

        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={slide.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${count}`}
            className="absolute inset-0 px-[140px] pb-[150px] pt-[120px]"
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 40 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -40 * dir }}
            transition={{ duration: reduce ? 0.15 : 0.45, ease: EASE }}
          >
            {slide.render()}
          </motion.div>
        </AnimatePresence>

        <footer className="absolute inset-x-[140px] bottom-[64px] flex items-center gap-8">
          <span className="flex items-center gap-3">
            <SuryoMark className="size-8" />
            <span className="font-display text-[30px] leading-none">Suryo</span>
          </span>
          <div className="flex flex-1 gap-2" role="tablist" aria-label="Slides">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => go(i)}
                className="group h-6 flex-1"
              >
                <span className="block h-[3px] overflow-hidden rounded-full bg-surface-3">
                  <span
                    className={cn("block h-full rounded-full bg-accent transition-[width] duration-500 ease-out", i <= index ? "w-full" : "w-0")}
                  />
                </span>
              </button>
            ))}
          </div>
          <span className="tabular font-mono text-[20px] text-fg-subtle">
            {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
          </span>
        </footer>
      </section>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[20px] uppercase tracking-[0.18em] text-accent">{children}</p>;
}

function Title({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("mt-8 font-display text-[112px] leading-[0.98] tracking-[-0.02em]", className)}>{children}</h2>;
}

function Problem() {
  const items = [
    { k: "01", title: "Unanswered calls", body: "The phone rings during a procedure, at lunch, after hours. The caller does not leave a message. They book somewhere else." },
    { k: "02", title: "Unresolved requests", body: "Billing questions, reports, reschedules. They land on a sticky note or a WhatsApp chat and quietly go nowhere." },
    { k: "03", title: "Forgotten follow ups", body: "Reminders, callbacks and aftercare check ins depend on someone remembering. On a busy day, nobody does." },
  ];
  return (
    <div className="flex h-full flex-col">
      <Eyebrow>The problem</Eyebrow>
      <Title className="max-w-[1400px]">
        Small businesses lose customers <em className="text-fg-muted">at the front desk.</em>
      </Title>
      <div className="mt-auto grid grid-cols-3 gap-16">
        {items.map((i) => (
          <div key={i.k} className="border-t border-border-strong pt-8">
            <span className="font-mono text-[20px] text-fg-faint">{i.k}</span>
            <h3 className="mt-4 text-[40px] font-medium tracking-[-0.01em]">{i.title}</h3>
            <p className="mt-4 text-[26px] leading-[1.5] text-fg-muted">{i.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Node({ x, y, w, h, title, lines, tone = "neutral" }: { x: number; y: number; w: number; h: number; title: string; lines: string[]; tone?: "neutral" | "accent" | "success" }) {
  const stroke = tone === "accent" ? "var(--accent)" : tone === "success" ? "var(--success)" : "var(--border-strong)";
  const fill = tone === "accent" ? "rgb(255 122 48 / 0.08)" : tone === "success" ? "rgb(60 207 142 / 0.07)" : "var(--surface)";
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={22} fill={fill} stroke={stroke} strokeWidth={tone === "neutral" ? 1.5 : 2} />
      <text x={x + 32} y={y + 56} fill="var(--fg)" fontSize={30} fontWeight={500} fontFamily="var(--font-sans)">
        {title}
      </text>
      {lines.map((l, i) => (
        <text key={l} x={x + 32} y={y + 100 + i * 38} fill="var(--fg-muted)" fontSize={22} fontFamily="var(--font-sans)">
          {l}
        </text>
      ))}
    </g>
  );
}

function Arrow({ d, dashed = false }: { d: string; dashed?: boolean }) {
  return <path d={d} fill="none" stroke="var(--fg-faint)" strokeWidth={2} strokeDasharray={dashed ? "6 8" : undefined} markerEnd="url(#arrow)" />;
}

function How() {
  return (
    <div className="flex h-full flex-col">
      <Eyebrow>How it works</Eyebrow>
      <Title className="text-[88px]">
        Every channel, <em className="text-fg-muted">one brain.</em>
      </Title>
      <svg viewBox="0 0 1640 560" className="mt-auto w-full" role="img" aria-label="Phone calls, website chat and the embedded widget feed one agent with tools and a knowledge base. It writes to the database and CRM, and a human console can take over any conversation.">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10Z" fill="var(--fg-faint)" />
          </marker>
        </defs>
        <text x={0} y={18} fill="var(--fg-subtle)" fontSize={18} fontFamily="var(--font-mono)" letterSpacing={3}>CHANNELS</text>
        <Node x={0} y={40} w={360} h={130} title="Phone call" lines={["Real time voice, bilingual"]} />
        <Node x={0} y={200} w={360} h={130} title="Website chat" lines={["Full page and mobile"]} />
        <Node x={0} y={360} w={360} h={130} title="Embedded widget" lines={["One script tag"]} />

        <text x={560} y={18} fill="var(--accent)" fontSize={18} fontFamily="var(--font-mono)" letterSpacing={3}>ONE BRAIN</text>
        <Node x={560} y={40} w={480} h={450} title="Agent" tone="accent" lines={["Conversation stages", "12 typed tools", "Knowledge search with sources", "Language and sentiment per turn", "Escalation guardrails", "Same logic for voice and chat"]} />

        <text x={1240} y={18} fill="var(--fg-subtle)" fontSize={18} fontFamily="var(--font-mono)" letterSpacing={3}>SYSTEM OF RECORD</text>
        <Node x={1240} y={40} w={400} h={250} title="Database and CRM" lines={["Appointments and slots", "Customers, tickets, leads", "Follow ups and emails"]} />
        <Node x={1240} y={330} w={400} h={160} title="Human console" tone="success" lines={["Live takeover", "Summaries and suggestions"]} />

        <Arrow d="M362 105 C 460 105, 460 200, 556 210" />
        <Arrow d="M362 265 L 556 265" />
        <Arrow d="M362 425 C 460 425, 460 330, 556 320" />
        <Arrow d="M1042 165 L 1236 165" />
        <Arrow d="M1042 410 L 1236 410" dashed />
      </svg>
    </div>
  );
}

function Demo({ live }: { live: LiveSnapshot }) {
  return (
    <div className="grid h-full grid-cols-[1fr_520px] items-center gap-32">
      <div>
        <Eyebrow>Live demo</Eyebrow>
        <Title>
          Call {live.agentName} <em className="text-accent">right now.</em>
        </Title>
        <p className="mt-10 max-w-[900px] text-[34px] leading-[1.45] text-fg-muted">
          Scan the code and ask for a teeth cleaning tomorrow evening. Speak English, Hindi or Hinglish. Watch the booking land in the
          console while you talk.
        </p>
        <ul className="mt-12 space-y-4 text-[26px] text-fg-subtle">
          <li>
            <span className="font-mono text-accent">try</span> Kal shaam teeth cleaning ka slot milega?
          </li>
          <li>
            <span className="font-mono text-accent">try</span> I have severe swelling and a fever.
          </li>
          <li>
            <span className="font-mono text-accent">try</span> Can I speak to a person?
          </li>
        </ul>
      </div>
      <CallQr path="/call/kesar" label={`Call ${live.businessName}`} className="[&_figcaption]:text-[22px]" />
    </div>
  );
}

function Impact({ live }: { live: LiveSnapshot }) {
  const a = live.analytics;
  const e = live.evaluation;
  const metrics = a
    ? [
        { label: "Conversations", value: a.conversations.toLocaleString("en-IN") },
        { label: "Resolved by AI", value: formatPercent(a.containmentRate) },
        { label: "Bookings", value: a.bookings.toLocaleString("en-IN") },
        { label: "Revenue booked", value: formatInr(a.revenueBookedInr) },
        { label: "Avg response", value: formatLatency(a.avgResponseMs) },
      ]
    : [];
  return (
    <div className="flex h-full flex-col">
      <Eyebrow>Impact, live from the database</Eyebrow>
      <Title className="text-[88px]">
        {live.businessName}, <em className="text-fg-muted">last 14 days.</em>
      </Title>
      {a ? (
        <dl className="mt-auto grid grid-cols-5 gap-10">
          {metrics.map((m) => (
            <div key={m.label} className="border-t border-border-strong pt-8">
              <dt className="text-[24px] text-fg-subtle">{m.label}</dt>
              <dd className="tabular mt-5 whitespace-nowrap font-display text-[88px] leading-none">{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-auto text-[32px] text-fg-muted">Live numbers are unavailable. The database did not respond.</p>
      )}
      <div className="mt-16 flex items-center gap-8 rounded-3xl border border-border bg-surface px-10 py-8">
        <span className="font-mono text-[20px] uppercase tracking-[0.16em] text-fg-subtle">Latest eval run</span>
        {e ? (
          <>
            <span className="tabular font-display text-[64px] leading-none text-success">
              {e.passed}/{e.total}
            </span>
            <span className="text-[26px] text-fg-muted">
              scenarios passed{e.avgLatencyMs != null ? `, ${formatLatency(e.avgLatencyMs)} average turn` : ""}
            </span>
          </>
        ) : (
          <span className="text-[30px] text-fg-muted">Eval run pending</span>
        )}
      </div>
    </div>
  );
}

function Next() {
  const items = [
    { title: "GoHighLevel and HubSpot", body: "Adapters behind the same tool layer, so bookings and leads land in the CRM a business already uses." },
    { title: "WhatsApp and real phone numbers", body: "The same agent on the channels Indian customers actually use, with a dedicated number per business." },
    { title: "Multi location scheduling", body: "Route by branch, doctor and specialty across locations, with shared availability rules." },
    { title: "Outbound follow up calls", body: "Reminders, no show recovery and aftercare check ins placed as real voice calls." },
  ];
  return (
    <div className="flex h-full flex-col">
      <Eyebrow>What is next</Eyebrow>
      <Title className="text-[88px]">
        From one clinic <em className="text-fg-muted">to every front desk.</em>
      </Title>
      <div className="mt-auto grid grid-cols-2 gap-x-20 gap-y-12">
        {items.map((i, n) => (
          <div key={i.title} className="flex gap-8 border-t border-border-strong pt-8">
            <span className="font-mono text-[20px] text-accent">{String(n + 1).padStart(2, "0")}</span>
            <div>
              <h3 className="text-[36px] font-medium tracking-[-0.01em]">{i.title}</h3>
              <p className="mt-3 text-[24px] leading-[1.5] text-fg-muted">{i.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
