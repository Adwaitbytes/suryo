import type { CSSProperties } from "react";
import type { StoreProduct } from "@/lib/store/catalog";
import { cn } from "@/lib/utils";

/** Woven and block printed swatches for pieces without a photograph. */
const SWATCHES: Array<{ base: string; style: CSSProperties }> = [
  {
    base: "#1f1d1b",
    style: {
      backgroundImage:
        "repeating-linear-gradient(0deg, rgb(255 255 255 / 0.05) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgb(255 255 255 / 0.04) 0 1px, transparent 1px 5px), radial-gradient(120% 80% at 30% 20%, rgb(255 255 255 / 0.08), transparent 60%)",
    },
  },
  {
    base: "#2a3a63",
    style: {
      backgroundImage:
        "radial-gradient(circle at 50% 50%, rgb(246 241 234 / 0.85) 0 2.5px, transparent 3px), radial-gradient(circle at 0 0, rgb(246 241 234 / 0.55) 0 1.5px, transparent 2px), repeating-linear-gradient(45deg, rgb(255 255 255 / 0.04) 0 1px, transparent 1px 6px)",
      backgroundSize: "22px 22px, 22px 22px, auto",
    },
  },
];

/** Known pieces get the swatch that matches their fabric; anything else hashes to one so it stays stable. */
const SWATCH_BY_SKU: Record<string, number> = { "PT-PALAZZO": 0, "MASK-3": 1 };

function swatchFor(sku: string) {
  const known = SWATCH_BY_SKU[sku];
  if (known !== undefined) return SWATCHES[known];
  let hash = 0;
  for (const ch of sku) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return SWATCHES[hash % SWATCHES.length];
}

export function ProductMedia({ product, className, sizes = "card" }: { product: StoreProduct; className?: string; sizes?: "card" | "hero" }) {
  if (product.imageUrl) {
    const src = sizes === "card" ? product.imageUrl.replace("w=1200", "w=700") : product.imageUrl;
    return (
      <div
        role="img"
        aria-label={product.name}
        className={cn("bg-[#e8dfd2] bg-cover bg-center", className)}
        style={{ backgroundImage: `url(${src})` }}
      />
    );
  }
  const swatch = swatchFor(product.sku);
  return (
    <div role="img" aria-label={`${product.name}, fabric swatch`} className={cn("relative", className)} style={{ backgroundColor: swatch.base, ...swatch.style }}>
      <span className="absolute inset-x-0 bottom-4 text-center font-display text-[15px] italic text-[#f6f1ea]/70">{product.name}</span>
    </div>
  );
}
