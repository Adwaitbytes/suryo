import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/lib/db";

export const STORE_SLUG = "saanjh";

export type StoreProduct = {
  sku: string;
  name: string;
  category: string;
  priceInr: number;
  sizes: string[];
  description: string;
  finalSale: boolean;
  imageUrl: string | null;
};

/** Display order for category chips; anything unknown sorts after these. */
const CATEGORY_ORDER = ["Kurtas", "Shirts", "Dresses", "Co-ord sets", "Bottoms", "Accessories", "Sale"];

const SKU = /^[A-Z0-9-]{2,40}$/;

const storeBusinessId = cache(async (): Promise<string | null> => {
  const row = await db.query.businesses.findFirst({ where: eq(schema.businesses.slug, STORE_SLUG), columns: { id: true } });
  return row?.id ?? null;
});

const columns = {
  sku: schema.products.sku,
  name: schema.products.name,
  category: schema.products.category,
  priceInr: schema.products.priceInr,
  sizes: schema.products.sizes,
  description: schema.products.description,
  finalSale: schema.products.finalSale,
  imageUrl: schema.products.imageUrl,
};

export const listStoreProducts = cache(async (): Promise<StoreProduct[]> => {
  const businessId = await storeBusinessId();
  if (!businessId) return [];
  const rows = await db.select(columns).from(schema.products).where(eq(schema.products.businessId, businessId)).orderBy(asc(schema.products.name));
  // Sale items close the grid so full price pieces lead.
  return rows.sort((a, b) => rank(a.category) - rank(b.category));
});

export const getStoreProduct = cache(async (sku: string): Promise<StoreProduct | null> => {
  if (!SKU.test(sku)) return null;
  const businessId = await storeBusinessId();
  if (!businessId) return null;
  const [row] = await db
    .select(columns)
    .from(schema.products)
    .where(and(eq(schema.products.businessId, businessId), eq(schema.products.sku, sku)))
    .limit(1);
  return row ?? null;
});

export function storeCategories(products: StoreProduct[]): string[] {
  return [...new Set(products.map((p) => p.category))].sort((a, b) => rank(a) - rank(b));
}

function rank(category: string): number {
  const i = CATEGORY_ORDER.indexOf(category);
  return i === -1 ? CATEGORY_ORDER.length : i;
}
