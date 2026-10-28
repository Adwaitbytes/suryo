import { ArrowRight, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AskMeera } from "@/components/store/ask-meera";
import { ProductCard } from "@/components/store/product-card";
import { listStoreProducts, storeCategories } from "@/lib/store/catalog";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: { absolute: "Saanjh Studio, handloom everyday clothing" } };

const HERO_PHOTO = "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=1600&q=80&auto=format&fit=crop";

const PROMISES = [
  { title: "Woven by hand", body: "Cotton and silk cotton from weaving families in Maheshwar and Chanderi." },
  { title: "Free size exchanges", body: "Swap a size within 15 days of delivery. We pick up from your door." },
  { title: "Cash on delivery", body: "Pay at the door on orders up to ₹5,000, or by UPI and card." },
];

export default async function StorePage(props: PageProps<"/store">) {
  const query = await props.searchParams;
  const products = await listStoreProducts();
  const categories = storeCategories(products);
  const requested = typeof query.category === "string" ? query.category : null;
  const active = requested && categories.includes(requested) ? requested : null;
  const visible = active ? products.filter((p) => p.category === active) : products;

  return (
    <main>
      <section className="mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-10 sm:px-8 md:grid-cols-[1fr_1.05fr] md:items-end md:gap-14 md:pb-24 md:pt-16">
        <div className="md:pb-6">
          <p className="text-[11.5px] font-medium uppercase tracking-[0.22em] text-[#a8461f]">Handloom, made in Indore</p>
          <h1 className="mt-6 font-display text-[52px] leading-[0.98] tracking-[-0.02em] sm:text-[72px] lg:text-[88px]">
            Woven slowly. <em className="text-[#201b16]/55">Worn every day.</em>
          </h1>
          <p className="mt-6 max-w-[44ch] text-[16.5px] leading-relaxed text-[#201b16]/70">
            Kurtas, shirts and dresses in breathable handloom cotton and linen, cut for Indian weather and made in small batches in Indore.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <a href="#shop" className="inline-flex h-12 items-center gap-2 rounded-full bg-[#201b16] px-6 text-[14.5px] font-medium text-[#f6f1ea] transition-colors hover:bg-[#3a3128]">
              Shop the collection
              <ArrowRight aria-hidden className="size-4" />
            </a>
            <Link href="/store/help" className="text-[14px] text-[#201b16]/70 underline decoration-[#201b16]/25 underline-offset-[6px] transition-colors hover:text-[#201b16] hover:decoration-[#201b16]">
              Help with an order
            </Link>
          </div>
        </div>
        <div className="relative">
          <div
            role="img"
            aria-label="Handloom shirts and kurtas in natural tones hanging on a rail"
            className="aspect-[4/3.6] w-full rounded-[28px] bg-[#e8dfd2] bg-cover bg-center shadow-[0_40px_80px_-40px_rgb(32_27_22/0.45)]"
            style={{ backgroundImage: `url(${HERO_PHOTO})` }}
          />
          <div className="absolute -bottom-5 left-5 max-w-[230px] rounded-2xl bg-[#fbf8f3] p-4 shadow-[0_18px_40px_-18px_rgb(32_27_22/0.35)] sm:left-8">
            <p className="font-display text-[19px] leading-tight">Natural dyes, soft on skin.</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#201b16]/60">Block prints may release a little colour in the first wash.</p>
          </div>
        </div>
      </section>

      <section aria-label="Why Saanjh" className="border-y border-[#201b16]/10">
        <ul className="mx-auto grid max-w-7xl divide-y divide-[#201b16]/10 px-4 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0">
          {PROMISES.map((p) => (
            <li key={p.title} className="py-7 md:px-8 md:first:pl-0 md:last:pr-0">
              <h2 className="font-display text-[22px] leading-tight">{p.title}</h2>
              <p className="mt-2 max-w-[40ch] text-[13.5px] leading-relaxed text-[#201b16]/65">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="shop" aria-labelledby="shop-heading" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-24 pt-16 sm:px-8 md:pt-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 id="shop-heading" className="font-display text-[40px] leading-none tracking-[-0.015em] sm:text-[52px]">
              {active ?? "The collection"}
            </h2>
            <p className="mt-3 text-[13.5px] text-[#201b16]/55">
              {visible.length} {visible.length === 1 ? "piece" : "pieces"}
            </p>
          </div>
          <nav aria-label="Categories" className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:px-0">
            <ul className="flex gap-2">
              <Chip href="/store#shop" label="All" active={!active} />
              {categories.map((c) => (
                <Chip key={c} href={`/store?category=${encodeURIComponent(c)}#shop`} label={c} active={active === c} />
              ))}
            </ul>
          </nav>
        </div>

        {visible.length === 0 ? (
          <p className="mt-16 text-center text-[15px] text-[#201b16]/60">The collection is being restocked. Please check back soon.</p>
        ) : (
          <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
            {visible.map((p) => (
              <li key={p.sku}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="meera-heading" className="px-4 pb-20 sm:px-8">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[32px] bg-[#201b16] px-6 py-12 text-[#f6f1ea] sm:px-12 sm:py-16">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full bg-[radial-gradient(closest-side,rgb(168_70_31/0.45),transparent)]" />
          <div className="relative grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-end">
            <div>
              <p className="text-[11.5px] font-medium uppercase tracking-[0.22em] text-[#f6f1ea]/55">Order help, any hour</p>
              <h2 id="meera-heading" className="mt-4 font-display text-[38px] leading-[1.02] sm:text-[52px]">
                Meera knows every order <em className="text-[#f6f1ea]/60">and every policy.</em>
              </h2>
              <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-[#f6f1ea]/70">
                Track a parcel, swap a size or cancel before it ships, in English, Hindi or Hinglish. She checks your phone number before changing anything.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <AskMeera
                message="Where is my order?"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[#f6f1ea] px-6 text-[14.5px] font-medium text-[#201b16] transition-colors hover:bg-white"
              >
                Chat with Meera
              </AskMeera>
              <Link href="/call/saanjh" className="inline-flex h-12 items-center gap-2 rounded-full border border-[#f6f1ea]/25 px-6 text-[14.5px] font-medium transition-colors hover:border-[#f6f1ea]/60">
                <Phone aria-hidden className="size-4" />
                Call Meera
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <li className="shrink-0">
      <Link
        href={href}
        scroll={false}
        aria-current={active ? "page" : undefined}
        className={cn(
          "inline-flex h-9 items-center rounded-full border px-4 text-[13px] transition-[background-color,border-color,color] duration-150",
          active ? "border-[#201b16] bg-[#201b16] text-[#f6f1ea]" : "border-[#201b16]/15 text-[#201b16]/75 hover:border-[#201b16]/45 hover:text-[#201b16]",
        )}
      >
        {label}
      </Link>
    </li>
  );
}
