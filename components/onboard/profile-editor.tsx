"use client";

import { Plus, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/primitives";
import type { BusinessProfile, Persona } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const DAYS: Array<{ key: BusinessProfile["hours"][number]["day"]; label: string }> = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const inputClass =
  "w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-fg placeholder:text-fg-faint transition-[border-color,box-shadow] duration-150 hover:border-border-strong focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20";

function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-fg">{label}</span>
        {hint ? <span className="text-xs text-fg-subtle">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border px-6 py-6 first:border-t-0">
      <div>
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {description ? <p className="mt-0.5 text-[13px] text-fg-subtle">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

type Draft = { profile: BusinessProfile; persona: Persona; rulesText: string };

const toDraft = (profile: BusinessProfile, persona: Persona): Draft => ({ profile, persona, rulesText: profile.bookingRules.join("\n") });

export function ProfileEditor({
  businessId,
  profile,
  persona,
  onSaved,
}: {
  businessId: string;
  profile: BusinessProfile;
  persona: Persona;
  onSaved: (profile: BusinessProfile, persona: Persona) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(profile, persona));
  const [baseline, setBaseline] = useState(() => JSON.stringify(toDraft(profile, persona)));
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message?: string }>({ kind: "idle" });
  const dirty = useMemo(() => JSON.stringify(draft) !== baseline, [draft, baseline]);

  const setProfile = (patch: Partial<BusinessProfile>) => setDraft((d) => ({ ...d, profile: { ...d.profile, ...patch } }));
  const setPersona = (patch: Partial<Persona>) => setDraft((d) => ({ ...d, persona: { ...d.persona, ...patch } }));
  const hoursFor = (day: (typeof DAYS)[number]["key"]) => draft.profile.hours.find((h) => h.day === day) ?? { day, open: "", close: "" };
  const setHours = (day: (typeof DAYS)[number]["key"], patch: { open?: string; close?: string }) => {
    const next = DAYS.map((d) => (d.key === day ? { ...hoursFor(d.key), ...patch } : hoursFor(d.key)));
    setProfile({ hours: next });
  };
  const hoursPublished = draft.profile.hours.some((h) => h.open && h.close);

  const save = async () => {
    setStatus({ kind: "saving" });
    const bookingRules = draft.rulesText.split("\n").map((r) => r.trim()).filter(Boolean);
    const p = draft.profile;
    const body = {
      profile: {
        name: p.name,
        services: p.services.filter((s) => s.name.trim()),
        hours: p.hours,
        bookingRules,
        bookableOffering: p.bookableOffering,
        toneOfVoice: p.toneOfVoice,
      },
      persona: { agentName: draft.persona.agentName, greeting: draft.persona.greeting },
    };
    try {
      const res = await fetch(`/api/businesses/${businessId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => null)) as { profile?: BusinessProfile; persona?: Persona; error?: string } | null;
      if (!res.ok || !data?.profile || !data.persona) throw new Error(data?.error ?? `Save failed with HTTP ${res.status}.`);
      const next = toDraft(data.profile, data.persona);
      setDraft(next);
      setBaseline(JSON.stringify(next));
      onSaved(data.profile, data.persona);
      setStatus({ kind: "saved" });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Save failed." });
    }
  };

  return (
    <Panel>
      <Section title="Agent" description="How the agent introduces itself on calls and in chat.">
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <Field label="Name">
            <input className={inputClass} value={draft.persona.agentName} maxLength={24} onChange={(e) => setPersona({ agentName: e.target.value })} />
          </Field>
          <Field label="Greeting" hint={`Voice ${draft.persona.voice}`}>
            <input className={inputClass} value={draft.persona.greeting} maxLength={240} onChange={(e) => setPersona({ greeting: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section title="Business">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name">
            <input className={inputClass} value={draft.profile.name} maxLength={120} onChange={(e) => setProfile({ name: e.target.value })} />
          </Field>
          <Field label="What customers can book" hint="30 minute slots">
            <input className={inputClass} value={draft.profile.bookableOffering} maxLength={60} onChange={(e) => setProfile({ bookableOffering: e.target.value })} />
          </Field>
        </div>
        <Field label="Tone of voice">
          <textarea className={cn(inputClass, "min-h-[64px] resize-y leading-relaxed")} value={draft.profile.toneOfVoice} maxLength={300} onChange={(e) => setProfile({ toneOfVoice: e.target.value })} />
        </Field>
      </Section>

      <Section title="Services" description="Prices appear only where the website publishes them.">
        <div className="flex flex-col gap-2">
          {draft.profile.services.length === 0 ? <p className="text-[13px] text-fg-subtle">No services were listed on the website. Add the ones customers ask about.</p> : null}
          {draft.profile.services.map((s, i) => (
            <div key={i} className="group grid grid-cols-[1fr_auto] items-start gap-2 sm:grid-cols-[1.3fr_0.8fr_auto]">
              <input
                aria-label={`Service ${i + 1} name`}
                className={inputClass}
                value={s.name}
                onChange={(e) => setProfile({ services: draft.profile.services.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
              />
              <input
                aria-label={`Service ${i + 1} price`}
                placeholder="Not published"
                className={cn(inputClass, "col-start-1 font-mono text-[13px] sm:col-start-auto")}
                value={s.price}
                onChange={(e) => setProfile({ services: draft.profile.services.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) })}
              />
              <button
                type="button"
                aria-label={`Remove ${s.name || "service"}`}
                onClick={() => setProfile({ services: draft.profile.services.filter((_, j) => j !== i) })}
                className="row-start-1 grid size-9 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg sm:row-start-auto"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <div>
            <Button variant="ghost" size="sm" onClick={() => setProfile({ services: [...draft.profile.services, { name: "", description: "", price: "" }] })}>
              <Plus className="size-3.5" /> Add service
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Hours" description={hoursPublished ? "Bookable slots follow these hours." : "No hours were published, so the calendar uses weekdays 10:00 to 18:00 until you set them."}>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {DAYS.map((d) => {
            const h = hoursFor(d.key);
            return (
              <div key={d.key} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-[13px] text-fg-muted">{d.label}</span>
                <div className="flex items-center gap-1.5">
                  <input type="time" aria-label={`${d.label} opens`} className={cn(inputClass, "w-[92px] px-2 py-1.5 font-mono text-[13px] [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden")} value={h.open} onChange={(e) => setHours(d.key, { open: e.target.value })} />
                  <span className="text-fg-faint">to</span>
                  <input type="time" aria-label={`${d.label} closes`} className={cn(inputClass, "w-[92px] px-2 py-1.5 font-mono text-[13px] [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden")} value={h.close} onChange={(e) => setHours(d.key, { close: e.target.value })} />
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Booking rules" description="One rule per line. The agent follows these when booking.">
        <textarea
          aria-label="Booking rules"
          className={cn(inputClass, "min-h-[96px] resize-y leading-relaxed")}
          placeholder="For example: Calls can be booked up to 14 days ahead."
          value={draft.rulesText}
          onChange={(e) => setDraft((d) => ({ ...d, rulesText: e.target.value }))}
        />
      </Section>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-b-xl border-t border-border bg-surface/95 px-6 py-3.5 backdrop-blur">
        <span role="status" className={cn("text-[13px]", status.kind === "error" ? "text-danger" : status.kind === "saved" && !dirty ? "text-success" : "text-fg-subtle")}>
          {status.kind === "error"
            ? status.message
            : status.kind === "saving"
              ? "Saving"
              : dirty
                ? "Unsaved changes"
                : status.kind === "saved"
                  ? "Saved. The agent uses this from its next reply."
                  : "Everything here was read from the website."}
        </span>
        <div className="flex gap-2">
          {dirty ? (
            <Button variant="ghost" size="sm" onClick={() => setDraft(JSON.parse(baseline) as Draft)}>
              Discard
            </Button>
          ) : null}
          <Button variant="primary" size="sm" disabled={!dirty || status.kind === "saving"} onClick={save}>
            Save changes
          </Button>
        </div>
      </div>
    </Panel>
  );
}
