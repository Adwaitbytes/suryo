import type { Metadata } from "next";
import { clinicDoctors, clinicLocations, clinicProfile, clinicServices } from "@/lib/seed/clinic";
import { formatInr } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: "Kesar Dental & Skin, Indore" },
  description: "Sample clinic website with the Suryo chat widget embedded through one script tag.",
};

const HERO_PHOTO =
  "https://images.unsplash.com/photo-1598256989800-fe5f95da9787?w=1600&q=80&auto=format&fit=crop";

const featured = ["Teeth cleaning and polishing", "Root canal treatment", "Teeth whitening", "Braces and aligners consultation", "Dermatology consultation", "HydraFacial"];

const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

function to12h(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

export default function DemoSite() {
  const services = featured
    .map((name) => clinicServices.find((s) => s.name === name))
    .filter((s): s is (typeof clinicServices)[number] => Boolean(s));
  const weekday = clinicProfile.hours.find((h) => h.day === "mon");
  const sunday = clinicProfile.hours.find((h) => h.day === "sun");

  return (
    <div className="min-h-screen bg-[#f7f2ea] text-[#1d1a16] [color-scheme:light]">
      <div className="border-b border-[#1d1a16]/10 bg-[#1d1a16] px-4 py-2 text-center text-[12px] text-[#f7f2ea]/80">
        Sample website for the demo. The chat button in the corner is Suryo, added with a single script tag.
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="#top" className="flex items-center gap-2.5" aria-label="Kesar Dental and Skin home">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
            <circle cx="14" cy="14" r="13" fill="#e8590c" />
            <path d="M14 6c-3 4-3 12 0 16 3-4 3-12 0-16Z" fill="#f7f2ea" />
          </svg>
          <span className="font-display text-[22px] leading-none">Kesar</span>
          <span className="hidden text-[13px] text-[#1d1a16]/60 sm:inline">Dental &amp; Skin</span>
        </a>
        <nav aria-label="Main" className="hidden items-center gap-7 text-[14px] text-[#1d1a16]/75 md:flex">
          <a className="hover:text-[#1d1a16]" href="#services">Services</a>
          <a className="hover:text-[#1d1a16]" href="#doctors">Doctors</a>
          <a className="hover:text-[#1d1a16]" href="#visit">Visit us</a>
        </nav>
        <a
          href={`tel:${clinicProfile.contact.phone.replace(/\s/g, "")}`}
          className="rounded-full border border-[#1d1a16]/15 px-4 py-2 text-[13px] font-medium transition-colors hover:bg-[#1d1a16] hover:text-[#f7f2ea]"
        >
          {clinicProfile.contact.phone}
        </a>
      </header>

      <main id="top">
        <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-6 sm:px-8 md:grid-cols-[1.05fr_1fr] md:items-center md:pt-12">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#b5470a]">Vijay Nagar and Palasia, Indore</p>
            <h1 className="mt-5 font-display text-[44px] leading-[1.02] tracking-[-0.015em] sm:text-[64px]">
              Calm, careful dentistry and skin care.
            </h1>
            <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-[#1d1a16]/70">{clinicProfile.description}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#services" className="rounded-full bg-[#1d1a16] px-5 py-3 text-[14px] font-medium text-[#f7f2ea] transition-opacity hover:opacity-90">
                See treatments and prices
              </a>
              <span className="text-[13px] text-[#1d1a16]/60">or tap the chat button to book in a minute</span>
            </div>
          </div>
          <div
            role="img"
            aria-label="A bright dental treatment room with an orange chair"
            className="aspect-[4/3.4] w-full rounded-[28px] bg-[#e9dfd0] bg-cover bg-center shadow-[0_30px_60px_-30px_rgba(29,26,22,0.45)]"
            style={{ backgroundImage: `url(${HERO_PHOTO})` }}
          />
        </section>

        <section id="services" className="border-t border-[#1d1a16]/10 bg-[#fbf8f3]">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-display text-[36px] leading-tight sm:text-[44px]">Treatments and prices</h2>
              <p className="text-[14px] text-[#1d1a16]/60">Published prices. No surprises at the counter.</p>
            </div>
            <ul className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-[#1d1a16]/10 bg-[#1d1a16]/10 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s) => (
                <li key={s.name} className="flex flex-col gap-2 bg-[#fbf8f3] p-6">
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#1d1a16]/50">{s.category}</span>
                  <span className="text-[17px] font-medium">{s.name}</span>
                  <span className="text-[14px] leading-relaxed text-[#1d1a16]/65">{s.description}</span>
                  <span className="mt-auto pt-3 text-[15px] font-medium text-[#b5470a]">
                    {s.priceInr != null ? `from ${formatInr(s.priceInr)}` : "Price on consultation"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="doctors" className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <h2 className="font-display text-[36px] leading-tight sm:text-[44px]">Our specialists</h2>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {clinicDoctors.map((d) => (
              <li key={d.name} className="border-t border-[#1d1a16]/15 pt-4">
                <div className="text-[16px] font-medium">{d.name}</div>
                <div className="mt-1 text-[14px] text-[#1d1a16]/65">{d.title}</div>
                <div className="mt-2 text-[12px] text-[#1d1a16]/50">{d.languages.join(", ")}</div>
              </li>
            ))}
          </ul>
        </section>

        <section id="visit" className="bg-[#1d1a16] text-[#f7f2ea]">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 md:grid-cols-3">
            {clinicLocations.map((l) => (
              <div key={l.key}>
                <h2 className="font-display text-[30px]">{l.name}</h2>
                <p className="mt-3 max-w-[32ch] text-[14px] leading-relaxed text-[#f7f2ea]/70">{l.address}</p>
                <p className="mt-3 text-[14px]">{l.phone}</p>
              </div>
            ))}
            <div>
              <h2 className="font-display text-[30px]">Hours</h2>
              <p className="mt-3 text-[14px] text-[#f7f2ea]/70">
                {DAY_LABEL.mon} to {DAY_LABEL.sat}, {weekday ? `${to12h(weekday.open)} to ${to12h(weekday.close)}` : "closed"}
              </p>
              <p className="mt-1 text-[14px] text-[#f7f2ea]/70">
                {DAY_LABEL.sun}, {sunday?.open ? `${to12h(sunday.open)} to ${to12h(sunday.close)}` : "closed"}
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#1d1a16]/50">How the chat got here</p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-[#1d1a16]/10 bg-[#fbf8f3] p-4 font-mono text-[13px] leading-relaxed text-[#1d1a16]/80">
            <code>{`<script src="/widget.js" data-business="kesar" async></script>`}</code>
          </pre>
        </section>
      </main>

      <footer className="border-t border-[#1d1a16]/10 px-5 py-8 text-center text-[12px] text-[#1d1a16]/50">
        Kesar Dental &amp; Skin is a fictional clinic created for the Suryo demo.
      </footer>

      <script src="/widget.js" data-business="kesar" async />
    </div>
  );
}
