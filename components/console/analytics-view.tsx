"use client";

import { useState } from "react";
import { SectionLabel } from "@/components/ui/primitives";
import type { Analytics } from "@/lib/console/types";
import { cn, formatInr } from "@/lib/utils";
import { ErrorNote, PageHeader } from "./bits";
import { LANGUAGE_NAMES, formatMs } from "./format";
import { touches, useResource } from "./hooks";
import { useConsole } from "./provider";

type Range = 7 | 14 | 30;

export function AnalyticsView() {
  const { business } = useConsole();
  const [days, setDays] = useState<Range>(14);
  const res = useResource<{ analytics: Analytics; days: number }>(business ? `/api/console/analytics?business=${business.id}&days=${days}` : null, {
    refreshOn: touches(["conversation.started", "appointment.changed", "lead.created", "ticket.created", "escalation.created", "followup.changed"]),
  });
  const a = res.data?.analytics;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Analytics"
        description="Computed live from conversations, bookings and follow ups. Evaluation traffic is excluded."
        actions={
          <div role="radiogroup" aria-label="Date range" className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
            {([7, 14, 30] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={days === d}
                onClick={() => setDays(d)}
                className={cn("h-7 rounded-md px-2.5 text-[13px] transition-colors", days === d ? "bg-surface-3 text-fg" : "text-fg-subtle hover:text-fg-muted")}
              >
                {d} days
              </button>
            ))}
          </div>
        }
      />
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {res.error ? <ErrorNote message={res.error} onRetry={() => void res.refresh()} /> : null}
        <div className="mx-auto max-w-[1400px] px-6 py-6 2xl:px-8">
          {a ? <Body a={a} days={days} /> : <BodySkeleton />}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, emphasis }: { label: string; value: string; sub: string; emphasis?: boolean }) {
  return (
    <div className="bg-surface px-5 py-5">
      <div className="text-2xs font-medium uppercase tracking-[0.08em] text-fg-subtle">{label}</div>
      <div className={cn("tabular mt-2 font-display leading-none text-fg", emphasis ? "text-[52px]" : "text-[44px]")}>{value}</div>
      <div className="mt-2 text-xs text-fg-subtle">{sub}</div>
    </div>
  );
}

function Body({ a, days }: { a: Analytics; days: number }) {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const total = a.voice + a.chat;
  return (
    <>
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-border bg-border">
        <Metric emphasis label="Conversations handled" value={a.conversations.toLocaleString("en-IN")} sub={`${a.voice} calls and ${a.chat} chats in ${days} days`} />
        <Metric emphasis label="Containment rate" value={pct(a.containmentRate)} sub="Finished conversations closed without a human" />
        <Metric emphasis label="Bookings by the assistant" value={a.bookings.toLocaleString("en-IN")} sub="Confirmed or completed, made in conversation" />
        <Metric emphasis label="Revenue booked" value={formatInr(a.revenueBookedInr) || "₹0"} sub="Listed fees of those bookings" />
        <Metric label="Leads captured" value={a.leads.toLocaleString("en-IN")} sub={`${a.tickets} support tickets opened`} />
        <Metric label="Escalations" value={a.escalations.toLocaleString("en-IN")} sub={a.openEscalations ? `${a.openEscalations} still open` : "None open right now"} />
        <Metric label="Avg response" value={a.avgResponseMs ? formatMs(a.avgResponseMs) : "n/a"} sub={a.p50FirstTokenMs ? `${formatMs(a.p50FirstTokenMs)} median to first token` : "Full agent reply time"} />
        <Metric label="Follow ups sent" value={a.followUpsSent.toLocaleString("en-IN")} sub={`${a.followUpsPending} still scheduled or due`} />
      </div>

      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <DailyChart daily={a.daily} />
      </section>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <section className="rounded-xl border border-border bg-surface p-5">
          <SectionLabel>Channel split</SectionLabel>
          {total === 0 ? (
            <p className="mt-3 text-[13px] text-fg-subtle">No conversations in this range.</p>
          ) : (
            <>
              <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Voice ${a.voice}, chat ${a.chat}`}>
                {a.voice ? <span className="h-full rounded-l-full bg-accent" style={{ width: `${(a.voice / total) * 100}%` }} /> : null}
                {a.chat ? <span className="h-full rounded-r-full bg-info" style={{ width: `${(a.chat / total) * 100}%` }} /> : null}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-4">
                {[
                  { label: "Voice", value: a.voice, swatch: "bg-accent" },
                  { label: "Chat", value: a.chat, swatch: "bg-info" },
                ].map((r) => (
                  <div key={r.label}>
                    <dt className="flex items-center gap-2 text-xs text-fg-muted">
                      <span aria-hidden className={cn("size-2 rounded-sm", r.swatch)} />
                      {r.label}
                    </dt>
                    <dd className="tabular mt-1 font-display text-3xl leading-none text-fg">
                      {r.value} <span className="font-sans text-sm text-fg-subtle">{Math.round((r.value / total) * 100)}%</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </section>
        <section className="rounded-xl border border-border bg-surface p-5">
          <SectionLabel>Languages</SectionLabel>
          {a.languages.length === 0 ? (
            <p className="mt-3 text-[13px] text-fg-subtle">No conversations in this range.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {a.languages.map((l) => {
                const share = total ? l.count / total : 0;
                return (
                  <li key={l.language} className="grid grid-cols-[88px_1fr_64px] items-center gap-3 text-[13px]">
                    <span className="text-fg-muted">{LANGUAGE_NAMES[l.language] ?? l.language}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-3">
                      <span className="block h-full rounded-full bg-fg-muted" style={{ width: `${share * 100}%` }} />
                    </span>
                    <span className="tabular text-right font-mono text-xs text-fg-muted">
                      {l.count} <span className="text-fg-faint">{Math.round(share * 100)}%</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** Daily conversations and bookings on one count axis, with a table view for screen readers and exact values. */
function DailyChart({ daily }: { daily: Analytics["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const W = 1200;
  const H = 260;
  const m = { top: 16, right: 12, bottom: 28, left: 52 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const max = niceMax(Math.max(1, ...daily.map((d) => Math.max(d.conversations, d.bookings))));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const band = iw / Math.max(1, daily.length);
  const barW = Math.min(18, (band - 10) / 2);
  const y = (v: number) => m.top + ih - (v / max) * ih;
  const labelEvery = daily.length > 20 ? 5 : daily.length > 10 ? 2 : 1;
  const fmtDay = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const totals = daily.reduce((s, d) => ({ c: s.c + d.conversations, b: s.b + d.bookings }), { c: 0, b: 0 });

  return (
    <div>
      <div className="flex items-start gap-6">
        <div>
          <SectionLabel>Daily volume</SectionLabel>
          <div className="mt-1 text-[13px] text-fg-muted">
            {totals.c} conversations and {totals.b} bookings over {daily.length} days, India time
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs text-fg-muted">
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-2 rounded-sm bg-info" /> Conversations
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-2 rounded-sm bg-accent" /> Bookings
          </span>
          <button type="button" onClick={() => setAsTable((t) => !t)} className="rounded-md border border-border px-2 py-1 text-2xs text-fg-subtle hover:border-border-strong hover:text-fg">
            {asTable ? "Show chart" : "Show table"}
          </button>
        </div>
      </div>
      {asTable ? (
        <table className="mt-4 w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-2xs uppercase tracking-[0.08em] text-fg-subtle">
              <th className="py-2 font-medium">Day</th>
              <th className="py-2 text-right font-medium">Conversations</th>
              <th className="py-2 text-right font-medium">Bookings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {daily.map((d) => (
              <tr key={d.day}>
                <td className="py-1.5 text-fg-muted">{fmtDay(d.day)}</td>
                <td className="tabular py-1.5 text-right font-mono text-xs">{d.conversations}</td>
                <td className="tabular py-1.5 text-right font-mono text-xs">{d.bookings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative mt-4">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Daily conversations and bookings. ${totals.c} conversations, ${totals.b} bookings.`} onPointerLeave={() => setHover(null)}>
            <text x={12} y={m.top + ih / 2} transform={`rotate(-90 12 ${m.top + ih / 2})`} textAnchor="middle" className="fill-fg-faint text-[11px]">
              Count per day
            </text>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.left} x2={W - m.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t === 0 ? undefined : "2 4"} />
                <text x={m.left - 8} y={y(t) + 4} textAnchor="end" className="tabular fill-fg-subtle font-mono text-[11px]">
                  {t}
                </text>
              </g>
            ))}
            {daily.map((d, i) => {
              const cx = m.left + band * i + band / 2;
              const active = hover === i;
              return (
                <g key={d.day} onPointerEnter={() => setHover(i)}>
                  <rect x={m.left + band * i} y={m.top} width={band} height={ih} fill={active ? "var(--surface-2)" : "transparent"} />
                  <Bar x={cx - barW - 1} w={barW} top={y(d.conversations)} base={y(0)} fill="var(--info)" />
                  <Bar x={cx + 1} w={barW} top={y(d.bookings)} base={y(0)} fill="var(--accent)" />
                  {i % labelEvery === 0 || i === daily.length - 1 ? (
                    <text x={cx} y={H - 8} textAnchor="middle" className={cn("text-[11px]", active ? "fill-fg" : "fill-fg-subtle")}>
                      {fmtDay(d.day)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          {hover !== null ? (
            <div
              className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-xs shadow-md"
              style={{ left: `${((m.left + band * hover + band / 2) / W) * 100}%` }}
            >
              <div className="font-medium text-fg">{fmtDay(daily[hover].day)}</div>
              <div className="mt-1 flex items-center gap-2 text-fg-muted">
                <span aria-hidden className="size-2 rounded-sm bg-info" /> {daily[hover].conversations} conversations
              </div>
              <div className="flex items-center gap-2 text-fg-muted">
                <span aria-hidden className="size-2 rounded-sm bg-accent" /> {daily[hover].bookings} bookings
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Bars anchored to the baseline with only the data end rounded. */
function Bar({ x, w, top, base, fill }: { x: number; w: number; top: number; base: number; fill: string }) {
  const h = base - top;
  if (h <= 0) return null;
  const r = Math.min(4, h, w / 2);
  return <path d={`M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`} fill={fill} />;
}

function BodySkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-3 bg-surface px-5 py-5">
            <div className="skeleton h-2.5 w-24" />
            <div className="skeleton h-11 w-20" />
            <div className="skeleton h-2.5 w-36" />
          </div>
        ))}
      </div>
      <div className="skeleton h-[320px] rounded-xl" />
    </div>
  );
}
