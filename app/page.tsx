import { ArrowRight, ArrowUpRight, MessageCircle, Phone, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { formatLatency, formatPercent, Wordmark } from "@/components/marketing/brand";
import { CallQr } from "@/components/marketing/call-qr";
import { EmbedSnippet } from "@/components/marketing/embed-snippet";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { getLiveSnapshot, type LiveSnapshot } from "@/components/marketing/live";
import { Reveal } from "@/components/marketing/reveal";
import { formatInr } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: "Suryo, the front desk that never misses a customer" },
};

const NEXT_STEPS = [
  { href: "/console", title: "Open the console", body: "Live conversations, takeovers, bookings and follow ups." },
  { href: "/onboard", title: "Onboard your business in 60 seconds", body: "Paste a website. Get a working agent." },
  { href: "/evals", title: "See the eval scorecard", body: "Every scenario, transcript and check." },
  { href: "/chat/kesar", title: "Try the chat", body: "The same agent, typed instead of spoken." },
] as const;

export default async function Home() {
  const live = await getLiveSnapshot();
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(60%_50%_at_70%_0%,rgb(255_122_48/0.10),transparent_70%)]" />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" aria-label="Suryo home">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-[13px] text-fg-muted">
          <Link href="/console" className="hidden rounded-md px-3 py-1.5 transition-colors hover:text-fg sm:inline-block">Console</Link>
          <Link href="/evals" className="hidden rounded-md px-3 py-1.5 transition-colors hover:text-fg sm:inline-block">Evals</Link>
          <Link href="/pitch" className="hidden rounded-md px-3 py-1.5 transition-colors hover:text-fg sm:inline-block">Pitch</Link>
          <Link
            href="/onboard"
            className="ml-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 font-medium text-fg transition-colors hover:border-border-strong hover:bg-surface-3"
          >
            Onboard a business
          </Link>
        </nav>
      </header>

      <main className="relative flex-1">
        <section className="mx-auto grid max-w-6xl gap-14 px-5 pb-20 pt-12 sm:px-8 md:pt-20 lg:grid-cols-[1fr_340px] lg:items-end lg:gap-20">
          <Reveal>
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-fg-subtle">
              <span className="live-dot size-1.5 rounded-full bg-accent" />
              AI customer operations for voice and chat
            </p>
            <h1 className="mt-7 font-display text-[52px] leading-[0.98] tracking-[-0.02em] text-fg sm:text-[76px] lg:text-[92px]">
              The front desk that <em className="text-accent">never misses</em> a customer.
            </h1>
            <p className="mt-7 max-w-[54ch] text-[17px] leading-relaxed text-fg-muted">
              Suryo picks up every call and chat in English, Hindi or Hinglish, books real appointments, opens tickets, follows up on
              time, and hands over to a person the moment it should.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/call/kesar"
                className="inline-flex h-12 items-center gap-2.5 rounded-xl bg-accent px-5 text-[15px] font-medium text-accent-fg shadow-[0_1px_0_rgb(255_255_255/0.25)_inset,0_10px_30px_-10px_rgb(255_122_48/0.6)] transition-[background-color,transform] hover:bg-accent-strong active:scale-[0.98]"
              >
                <Phone aria-hidden className="size-4" />
                Call Kesar Clinic
              </Link>
              <Link
                href="/chat/kesar"
                className="inline-flex h-12 items-center gap-2.5 rounded-xl border border-border bg-surface px-5 text-[15px] font-medium text-fg transition-colors hover:border-border-strong hover:bg-surface-2"
              >
                <MessageCircle aria-hidden className="size-4 text-fg-muted" />
                Try the chat
              </Link>
            </div>
            <div className="mt-6 flex max-w-xl flex-wrap items-center gap-x-4 gap-y-2.5 rounded-2xl border border-border bg-surface/70 py-3 pl-3.5 pr-4">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-fg-muted">
                <ShoppingBag className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle">Also a live demo</span>
                <span className="block text-[14px] font-medium text-fg">Online store: Saanjh Studio</span>
              </span>
              <span className="flex items-center gap-4 text-[13px]">
                <Link href="/store" className="group inline-flex items-center gap-1 font-medium text-fg transition-colors hover:text-accent">
                  Visit the store
                  <ArrowUpRight aria-hidden className="size-3.5 text-fg-faint transition-colors group-hover:text-accent" />
                </Link>
                <Link href="/call/saanjh" className="group inline-flex items-center gap-1 font-medium text-fg transition-colors hover:text-accent">
                  Call Meera
                  <Phone aria-hidden className="size-3.5 text-fg-faint transition-colors group-hover:text-accent" />
                </Link>
              </span>
            </div>
          </Reveal>

          <Reveal delay={0.15} className="mx-auto w-full max-w-[300px] lg:max-w-none">
            <div className="rounded-3xl border border-border bg-surface p-5 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle">Scan to call</span>
                <span className="flex items-center gap-1.5 text-[11px] text-success">
                  <span className="live-dot size-1.5 rounded-full bg-success" />
                  {live.agentName} is available
                </span>
              </div>
              <CallQr path="/call/kesar" label={`Call ${live.businessName}`} tone="inverted" className="mt-5" codeClassName="w-[196px]" />
              <p className="mt-4 text-center text-[13px] leading-relaxed text-fg-muted">
                Point your phone camera here and talk to {live.agentName}, the front desk at {live.businessName}.
              </p>
            </div>
          </Reveal>
        </section>

        <section aria-labelledby="live-heading" className="border-y border-border bg-bg-subtle">
          <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="live-heading" className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-subtle">
                Live from {live.businessName}, last 14 days
              </h2>
              <span className="font-mono text-[11px] text-fg-faint">Computed from the database on every page load</span>
            </div>
            <LiveNumbers live={live} />
          </div>
        </section>

        <section aria-labelledby="how-heading" className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <Reveal>
            <h2 id="how-heading" className="max-w-[24ch] font-display text-[40px] leading-[1.04] tracking-[-0.015em] text-fg sm:text-[56px]">
              Everything a great front desk does, <em className="text-fg-muted">all day, every day.</em>
            </h2>
          </Reveal>
          <div className="mt-14">
            <HowItWorks evaluation={live.evaluation} />
          </div>
        </section>

        <section aria-labelledby="embed-heading" className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
          <div className="grid gap-10 rounded-3xl border border-border bg-surface p-7 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <h2 id="embed-heading" className="font-display text-[34px] leading-[1.05] text-fg sm:text-[44px]">
                One script tag. Any website.
              </h2>
              <p className="mt-4 max-w-[44ch] text-[15px] leading-relaxed text-fg-muted">
                The chat drops into an existing site without touching its code or styles. Visitors who start in chat can switch to a
                call and keep the same conversation.
              </p>
              <Link href="/demo-site" className="group mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent">
                See it on a sample clinic website
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <EmbedSnippet business="kesar" />
          </div>
        </section>

        <section aria-labelledby="next-heading" className="mx-auto max-w-6xl px-5 pb-28 sm:px-8">
          <h2 id="next-heading" className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-subtle">
            Look under the hood
          </h2>
          <ul className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {NEXT_STEPS.map((step) => (
              <li key={step.href} className="bg-bg">
                <Link href={step.href} className="group flex h-full flex-col gap-2 p-6 transition-colors hover:bg-surface">
                  <span className="flex items-start justify-between gap-3 text-[15px] font-medium text-fg">
                    {step.title}
                    <ArrowUpRight aria-hidden className="size-4 shrink-0 text-fg-faint transition-[color,transform] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
                  </span>
                  <span className="text-[13px] leading-relaxed text-fg-subtle">{step.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-[13px] text-fg-subtle sm:px-8">
          <span className="flex items-center gap-3">
            <Wordmark className="[&_span]:text-[18px]" />
            <span className="text-fg-faint">Built at CODE E FIESTA 2026</span>
          </span>
          <span className="font-mono text-[11px] text-fg-faint">Kesar Dental &amp; Skin and Saanjh Studio are fictional demo businesses</span>
        </div>
      </footer>
    </div>
  );
}

function LiveNumbers({ live }: { live: LiveSnapshot }) {
  const a = live.analytics;
  if (!a) {
    return <p className="mt-6 text-[14px] text-fg-muted">Live numbers are unavailable right now. The database did not respond.</p>;
  }
  const metrics = [
    { label: "Conversations", value: a.conversations.toLocaleString("en-IN"), note: `${a.voice} voice, ${a.chat} chat` },
    { label: "Resolved without a person", value: formatPercent(a.containmentRate), note: `${a.escalations} handed to the desk` },
    { label: "Appointments booked", value: a.bookings.toLocaleString("en-IN"), note: `${a.tickets} tickets, ${a.leads} leads` },
    { label: "Revenue booked", value: formatInr(a.revenueBookedInr), note: "At published prices" },
    { label: "Average response", value: formatLatency(a.avgResponseMs), note: a.p50FirstTokenMs != null ? `First words in ${formatLatency(a.p50FirstTokenMs)}` : "Per agent turn" },
  ];
  return (
    <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-5">
      {metrics.map((m) => (
        <div key={m.label} className="min-w-0">
          <dt className="text-[12px] text-fg-subtle">{m.label}</dt>
          <dd className="tabular mt-2 text-[34px] font-semibold leading-none tracking-[-0.04em] text-fg">{m.value}</dd>
          <dd className="mt-2 truncate font-mono text-[11px] text-fg-faint">{m.note}</dd>
        </div>
      ))}
    </dl>
  );
}
