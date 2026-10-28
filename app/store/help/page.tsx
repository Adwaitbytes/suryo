import { ArrowRight, PackageX, Phone, RefreshCcw, Truck, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AskMeera } from "@/components/store/ask-meera";

export const metadata: Metadata = {
  title: "Help with an order",
  description: "Track an order, start a return or exchange, or cancel before it ships.",
};

const TOPICS: Array<{ id: string; icon: LucideIcon; title: string; body: string; facts: string[]; message: string; cta: string }> = [
  {
    id: "track",
    icon: Truck,
    title: "Track my order",
    body: "See where your parcel is, which courier has it and when it should reach you.",
    facts: ["Dispatched within 24 hours on working days", "2 to 4 days to metro cities, 4 to 7 days elsewhere", "Tracking link by SMS and email once shipped"],
    message: "Where is my order?",
    cta: "Track my order",
  },
  {
    id: "returns",
    icon: RefreshCcw,
    title: "Return or exchange",
    body: "Wrong size or not quite right? Book a pickup from your door in a minute.",
    facts: ["Within 15 days of delivery, unworn with tags", "Size exchanges are free", "₹99 pickup fee on returns, waived if damaged or wrong"],
    message: "I want to return or exchange an item",
    cta: "Return or exchange",
  },
  {
    id: "cancel",
    icon: PackageX,
    title: "Cancel an order",
    body: "Changed your mind? You can cancel any time before the order ships.",
    facts: ["Possible while the order is placed or packed", "Prepaid orders refunded in full", "Already shipped? Refuse it at the door or return it"],
    message: "I want to cancel an order",
    cta: "Cancel an order",
  },
];

const FAQ = [
  { q: "Is cash on delivery available?", a: "Yes, on orders up to ₹5,000, with a ₹49 handling fee. We also accept UPI, cards and net banking." },
  { q: "When will I get my refund?", a: "UPI and card orders are refunded to the original method within 5 to 7 business days after pickup. Cash on delivery orders are refunded by UPI or bank transfer within 7 business days." },
  { q: "Can I return a final sale item?", a: "No. Final sale pieces, masks and gift cards cannot be returned or exchanged, unless they arrive damaged or wrong. Tell us within 48 hours." },
  { q: "Do you ship outside India?", a: "Not yet. We ship across India from our Indore warehouse." },
];

const DEMO_ORDERS = [
  { number: "SJ-47120", note: "Shipped, on its way" },
  { number: "SJ-48213", note: "Delivered 3 days ago, phone 9826055501" },
  { number: "SJ-48390", note: "Just placed, cash on delivery" },
  { number: "SJ-47911", note: "Final sale items" },
];

export default function HelpPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 pb-24 pt-12 sm:px-8 sm:pt-16">
      <header className="max-w-3xl">
        <p className="text-[11.5px] font-medium uppercase tracking-[0.22em] text-[#a8461f]">Orders and help</p>
        <h1 className="mt-5 font-display text-[48px] leading-[0.98] tracking-[-0.02em] sm:text-[72px]">
          How can we help <em className="text-[#201b16]/55">with your order?</em>
        </h1>
        <p className="mt-6 max-w-[52ch] text-[16px] leading-relaxed text-[#201b16]/70">
          Meera, our assistant, can see your order and act on it right away. Keep your order number or the phone number you ordered with handy.
        </p>
      </header>

      <ul className="mt-14 grid gap-4 md:grid-cols-3">
        {TOPICS.map((t) => {
          const Icon = t.icon;
          return (
            <li key={t.id} id={t.id} className="flex scroll-mt-24 flex-col rounded-[24px] border border-[#201b16]/10 bg-[#fbf8f3] p-6 sm:p-7">
              <span aria-hidden className="grid size-11 place-items-center rounded-full bg-[#201b16] text-[#f6f1ea]">
                <Icon className="size-[18px]" />
              </span>
              <h2 className="mt-6 font-display text-[28px] leading-tight">{t.title}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-[#201b16]/70">{t.body}</p>
              <ul className="mt-5 flex-1 space-y-2 border-t border-[#201b16]/10 pt-5 text-[13px] text-[#201b16]/65">
                {t.facts.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-[#a8461f]" />
                    {f}
                  </li>
                ))}
              </ul>
              <AskMeera
                message={t.message}
                className="group mt-7 inline-flex h-11 items-center justify-between rounded-full bg-[#201b16] pl-5 pr-4 text-[14px] font-medium text-[#f6f1ea] transition-colors hover:bg-[#3a3128]"
              >
                {t.cta}
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </AskMeera>
            </li>
          );
        })}
      </ul>

      <div className="mt-16 grid gap-12 md:grid-cols-[1.4fr_1fr] md:gap-16">
        <section aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="font-display text-[34px] leading-none sm:text-[40px]">Quick answers</h2>
          <dl className="mt-6 divide-y divide-[#201b16]/10 border-y border-[#201b16]/10">
            {FAQ.map((f) => (
              <div key={f.q} className="py-5">
                <dt className="text-[15px] font-medium">{f.q}</dt>
                <dd className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-[#201b16]/70">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <aside className="space-y-4">
          <div className="rounded-[24px] bg-[#201b16] p-6 text-[#f6f1ea] sm:p-7">
            <h2 className="font-display text-[26px] leading-tight">Rather talk?</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[#f6f1ea]/70">Call Meera from your browser. Same answers, same order tools, in your language.</p>
            <Link href="/call/saanjh" className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[#f6f1ea] px-5 text-[14px] font-medium text-[#201b16] transition-colors hover:bg-white">
              <Phone aria-hidden className="size-4" />
              Call Meera
            </Link>
          </div>
          <div className="rounded-[24px] border border-dashed border-[#201b16]/20 p-6 sm:p-7">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#201b16]/55">Demo orders to try</h2>
            <ul className="mt-4 space-y-3">
              {DEMO_ORDERS.map((o) => (
                <li key={o.number}>
                  <AskMeera message={`Where is my order ${o.number}?`} className="group flex w-full items-baseline justify-between gap-4 text-left">
                    <span className="tabular shrink-0 whitespace-nowrap font-mono text-[13.5px] text-[#201b16] underline-offset-4 group-hover:underline">{o.number}</span>
                    <span className="text-right text-[12.5px] text-[#201b16]/60">{o.note}</span>
                  </AskMeera>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
