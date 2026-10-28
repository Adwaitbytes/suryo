import Link from "next/link";
import type { StoreProduct } from "@/lib/store/catalog";
import { formatInr } from "@/lib/utils";
import { ProductMedia } from "./product-media";

export function ProductCard({ product }: { product: StoreProduct }) {
  return (
    <Link href={`/store/p/${product.sku}`} className="group block rounded-[20px] focus-visible:outline-offset-4">
      <div className="relative overflow-hidden rounded-[18px]">
        <ProductMedia
          product={product}
          className="aspect-[3/4] w-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.035] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        {product.finalSale ? (
          <span className="absolute left-3 top-3 rounded-full bg-[#fbf8f3]/95 px-2.5 py-1 text-[11px] font-medium tracking-[0.02em] text-[#8f3a17] shadow-[0_1px_2px_rgb(32_27_22/0.12)]">
            Final sale
          </span>
        ) : null}
      </div>
      <div className="mt-3.5 flex items-start justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <h3 className="text-[14.5px] font-medium leading-snug text-[#201b16] underline-offset-4 group-hover:underline">{product.name}</h3>
          <p className="mt-1 text-[12.5px] text-[#201b16]/55">{product.sizes.length === 1 ? "One size" : product.sizes.join("  ")}</p>
        </div>
        <span className="tabular shrink-0 text-[14.5px] text-[#201b16]">{formatInr(product.priceInr)}</span>
      </div>
    </Link>
  );
}
