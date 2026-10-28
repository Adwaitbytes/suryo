/**
 * Pool of Gemini API keys from different accounts. Each account has its own free
 * tier quota, so rotating keys multiplies daily limits, and a key that returns a
 * quota error is benched for a while instead of failing the customer's turn.
 */
const COOLDOWN_MS = 60_000;
const benched = new Map<string, number>();
let cursor = 0;

export function geminiKeys(): string[] {
  const list = [process.env.GEMINI_API_KEYS ?? "", process.env.GEMINI_API_KEY ?? ""]
    .join(",")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 10);
  return [...new Set(list)];
}

/** Keys in rotation order, healthy ones first. */
export function orderedKeys(): string[] {
  const keys = geminiKeys();
  if (keys.length === 0) throw new Error("No Gemini API key configured");
  cursor = (cursor + 1) % keys.length;
  const rotated = [...keys.slice(cursor), ...keys.slice(0, cursor)];
  const now = Date.now();
  return [...rotated.filter((k) => (benched.get(k) ?? 0) < now), ...rotated.filter((k) => (benched.get(k) ?? 0) >= now)];
}

export function isQuotaError(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? "")}` : String(err);
  return /quota|rate.?limit|429|RESOURCE_EXHAUSTED|exceeded/i.test(text);
}

export function bench(key: string): void {
  benched.set(key, Date.now() + COOLDOWN_MS);
}

/** Runs fn with each key in turn until one succeeds; only quota errors move on to the next key. */
export async function withGeminiKey<T>(fn: (key: string) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const key of orderedKeys()) {
    try {
      return await fn(key);
    } catch (err) {
      last = err;
      if (!isQuotaError(err)) throw err;
      bench(key);
    }
  }
  throw last;
}
