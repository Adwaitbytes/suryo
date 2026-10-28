import { Check } from "lucide-react";
import type { ReactNode } from "react";
import type { EvalSnapshot } from "./live";

function Frame({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden className="relative flex h-40 items-center justify-center overflow-hidden rounded-xl bg-bg-subtle">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgb(255_122_48/0.06),transparent_65%)]" />
      <div className="relative">{children}</div>
    </div>
  );
}

const BARS = [6, 14, 22, 12, 28, 18, 34, 20, 26, 10, 16, 24, 8, 18, 12, 6];

function VoiceAndChat() {
  return (
    <Frame>
      <div className="flex items-center gap-5">
        <div className="flex h-10 items-center gap-[3px]">
          {BARS.map((h, i) => (
            <span key={i} className="w-[3px] rounded-full bg-accent" style={{ height: h, opacity: 0.35 + (h / 34) * 0.65 }} />
          ))}
        </div>
        <div className="h-8 w-px bg-border-strong" />
        <div className="flex flex-col gap-1.5">
          <span className="w-fit rounded-xl rounded-br-sm bg-accent px-2.5 py-1 text-[12px] text-accent-fg">Kal shaam free ho?</span>
          <span className="w-fit rounded-xl rounded-tl-sm bg-surface-2 px-2.5 py-1 text-[12px] text-fg-muted">Haan, 5 baje slot hai</span>
        </div>
      </div>
    </Frame>
  );
}

function Grounded() {
  return (
    <Frame>
      <div className="w-56 space-y-2">
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-fg-muted">
          Root canal is from <span className="text-fg">4,500 rupees</span> for front teeth.
        </div>
        <div className="flex flex-wrap gap-1">
          {["Dental prices", "Root canal: before and after"].map((t) => (
            <span key={t} className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[12px] text-fg-subtle">
              {t}
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function Actions() {
  const steps = ["Checking availability", "Saving customer", "Booking appointment", "Sending confirmation"];
  return (
    <Frame>
      <ul className="space-y-1.5">
        {steps.map((s) => (
          <li key={s} className="flex items-center gap-2 text-[12px] text-fg-muted">
            <span className="grid size-4 place-items-center rounded-full bg-success-soft text-success">
              <Check className="size-2.5" strokeWidth={3} />
            </span>
            {s}
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function Takeover() {
  return (
    <Frame>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-[15px] font-semibold text-accent">R</span>
        <svg width="72" height="12" viewBox="0 0 72 12" className="text-fg-faint">
          <path d="M2 6h62" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 4" />
          <path d="M62 1.5 68 6l-6 4.5" stroke="var(--success)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="grid size-10 place-items-center rounded-full bg-success-soft text-[15px] font-semibold text-success">P</span>
      </div>
      <p className="mt-3 text-center font-mono text-[12px] text-fg-subtle">Summary travels with the chat</p>
    </Frame>
  );
}

function FollowUps() {
  const items = [
    ["Now", "Confirmation email"],
    ["3h before", "Reminder"],
    ["Next day", "Aftercare check in"],
  ];
  return (
    <Frame>
      <ol className="relative space-y-2.5 pl-4">
        <span className="absolute bottom-1 left-[3px] top-1 w-px bg-border-strong" />
        {items.map(([when, what], i) => (
          <li key={when} className="relative flex items-baseline gap-3 text-[12px]">
            <span className={`absolute -left-4 top-1 size-[7px] rounded-full ${i === 0 ? "bg-accent" : "bg-fg-faint"}`} />
            <span className="w-[4.5rem] font-mono text-[12px] text-fg-subtle">{when}</span>
            <span className="text-fg-muted">{what}</span>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

function Evals({ evaluation }: { evaluation: EvalSnapshot | null }) {
  const total = evaluation?.total ?? 0;
  return (
    <Frame>
      {evaluation ? (
        <div className="flex flex-col items-center">
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: Math.min(total, 40) }, (_, i) => (
              <span key={i} className={`size-2.5 rounded-[3px] ${i < evaluation.passed ? "bg-success/80" : "bg-danger/70"}`} />
            ))}
          </div>
          <p className="mt-3 font-mono text-[12px] text-fg-subtle">
            Latest run: {evaluation.passed} of {evaluation.total} scenarios passed
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 30 }, (_, i) => (
              <span key={i} className="size-2.5 rounded-[3px] bg-surface-3" />
            ))}
          </div>
          <p className="mt-3 font-mono text-[12px] text-fg-subtle">Eval run pending</p>
        </div>
      )}
    </Frame>
  );
}

export function HowItWorks({ evaluation }: { evaluation: EvalSnapshot | null }) {
  const items: Array<{ title: string; body: string; visual: ReactNode }> = [
    {
      title: "One brain for voice and chat",
      body: "Callers and website visitors reach the same agent, in English, Hindi or Hinglish, and can switch channels mid conversation.",
      visual: <VoiceAndChat />,
    },
    {
      title: "Answers from your own knowledge",
      body: "Prices, policies and aftercare come from the business's documents, with sources. When it does not know, it says so.",
      visual: <Grounded />,
    },
    {
      title: "Real actions, not promises",
      body: "It checks live availability, books, reschedules, cancels, opens tickets and records leads in the database.",
      visual: <Actions />,
    },
    {
      title: "A person steps in with one click",
      body: "Emergencies, disputes and frustrated customers reach the front desk with a summary, so nobody repeats themselves.",
      visual: <Takeover />,
    },
    {
      title: "Follow ups that actually happen",
      body: "Confirmations, reminders and callbacks are scheduled the moment they are promised, then tracked until sent.",
      visual: <FollowUps />,
    },
    {
      title: "Tested like software",
      body: "Simulated customers run booking, injection, emergency and language scenarios, and every result is scored.",
      visual: <Evals evaluation={evaluation} />,
    },
  ];
  return (
    <ul className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.title} className="flex flex-col gap-5 bg-bg p-6">
          {item.visual}
          <div>
            <h3 className="text-[15px] font-medium text-fg">{item.title}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">{item.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
