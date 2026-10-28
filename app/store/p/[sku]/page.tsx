import { ChevronDown, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AskMeera } from "@/components/store/ask-meera";
import { ProductCard } from "@/components/store/product-card";
import { ProductMedia } from "@/components/store/product-media";
import { SizePicker } from "@/components/store/size-picker";
import { getStoreProduct, listStoreProducts } from "@/lib/store/catalog";
import { formatInr } from "@/lib/utils";

export async function generateMetadata(props: PageProps<"/store/p/[sku]">): Promise<Metadata> {
  const { sku } = await props.params;
  const product = await getStoreProduct(sku);
  return product ? { title: product.name, description: product.description } : { title: "Not found" };
}

const isLinen = (text: string) => /linen/i.test(text);

export default async function ProductPage(props: PageProps<"/store/p/[sku]">) {
  const { sku } = await props.params;
  const product = await getStoreProduct(sku);
  if (!product) notFound();
  const all = await listStoreProducts();
  const related = [...all.filter((p) => p.sku !== product.sku && p.category === product.category), ...all.filter((p) => p.sku !== product.sku && p.category !== product.category && !p.finalSale)].slice(0, 4);
  const fabric = `${product.name} ${product.description}`;

  return (
    <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <nav aria-label="Breadcrumb" className="text-[13px] text-[#201b16]/55">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/store" className="hover:text-[#201b16]">Shop</Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href={`/store?category=${encodeURIComponent(product.category)}#shop`} className="hover:text-[#201b16]">
              {product.category}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-[#201b16]/80">{product.name}</li>
        </ol>
      </nav>

      <div className="mt-6 grid gap-10 md:grid-cols-[1.15fr_1fr] md:gap-14 lg:gap-20">
        <div className="relative">
          <ProductMedia product={product} sizes="hero" className="aspect-[4/5] w-full rounded-[28px]" />
          {product.finalSale ? (
            <span className="absolute left-4 top-4 rounded-full bg-[#fbf8f3]/95 px-3 py-1.5 text-[12px] font-medium text-[#8f3a17]">Final sale</span>
          ) : null}
        </div>

        <div className="md:sticky md:top-24 md:self-start">
          <p className="text-[11.5px] font-medium uppercase tracking-[0.22em] text-[#a8461f]">{product.category}</p>
          <h1 className="mt-4 font-display text-[40px] leading-[1.02] tracking-[-0.015em] sm:text-[54px]">{product.name}</h1>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="tabular text-[20px]">{formatInr(product.priceInr)}</span>
            <span className="text-[12.5px] text-[#201b16]/55">Inclusive of GST</span>
          </div>
          <p className="mt-6 max-w-[46ch] text-[15.5px] leading-relaxed text-[#201b16]/75">{product.description}</p>

          <div className="mt-8 border-t border-[#201b16]/10 pt-7">
            <SizePicker sizes={product.sizes} finalSale={product.finalSale} />
          </div>

          <AskMeera
            message={`Which size should I pick in the ${product.name}?`}
            className="mt-4 inline-flex items-center gap-2 text-[13.5px] text-[#201b16]/75 underline decoration-[#201b16]/25 underline-offset-[5px] transition-colors hover:text-[#201b16] hover:decoration-[#201b16]"
          >
            <MessageCircle aria-hidden className="size-4" />
            Not sure about the size? Ask Meera
          </AskMeera>

          <div className="mt-8 divide-y divide-[#201b16]/10 border-y border-[#201b16]/10">
            {product.sizes.length > 1 ? (
            <Detail title="Size and fit" open>
              Chest: XS 34 in, S 36, M 38, L 40, XL 42, XXL 44.{" "}
              {product.category === "Kurtas" || product.category === "Shirts"
                ? "A relaxed fit, so if you are between sizes pick the smaller one."
                : "A regular fit, so if you are between sizes pick the larger one."}
            </Detail>
            ) : null}
            <Detail title="Fabric and care">
              {isLinen(fabric)
                ? "Gentle wash, do not tumble dry, iron while slightly damp. Linen may shrink up to 2 percent after the first wash."
                : "Hand wash or gentle machine wash cold, wash dark colours separately for the first few washes, dry in shade. Natural dyes may release a little colour at first."}
            </Detail>
            <Detail title="Delivery">
              Dispatched within 24 hours on working days. 2 to 4 days to metro cities, 4 to 7 days elsewhere. Free shipping above ₹999, cash on delivery up to ₹5,000.
            </Detail>
            <Detail title="Returns and exchanges">
              {product.finalSale
                ? "Final sale items cannot be returned or exchanged. If it arrives damaged or wrong, tell us within 48 hours and we will replace or refund it."
                : "Return or exchange within 15 days of delivery, unworn with tags. Size exchanges are free; a ₹99 pickup fee applies to returns."}
            </Detail>
          </div>
        </div>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related-heading" className="mt-24">
          <h2 id="related-heading" className="font-display text-[32px] leading-none sm:text-[40px]">You may also like</h2>
          <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
            {related.map((p) => (
              <li key={p.sku}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function Detail({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown aria-hidden className="size-4 text-[#201b16]/50 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <p className="mt-3 max-w-[52ch] text-[13.5px] leading-relaxed text-[#201b16]/70">{children}</p>
    </details>
  );
}
