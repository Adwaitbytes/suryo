import * as cheerio from "cheerio";
import { assertPublicHost, OnboardError } from "./url";

export type CrawledPage = {
  url: string;
  title: string;
  description: string;
  text: string;
};

export type CrawlProgress =
  | { kind: "page"; url: string; title: string; index: number; chars: number }
  | { kind: "skipped"; url: string; reason: string };

export type CrawlOptions = {
  maxPages?: number;
  pageTimeoutMs?: number;
  budgetMs?: number;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (event: CrawlProgress) => void;
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MAX_BYTES = 2_500_000;
const MAX_PAGE_CHARS = 8_000;
const MAX_REDIRECTS = 5;

const PRIORITY: Array<[RegExp, number]> = [
  [/llms\.txt$/, 60],
  [/about|who-we-are|our-story|company/, 40],
  [/service|solution|offering|treatment|what-we-do|product|menu|capabilit/, 40],
  [/pric|plan|package|fee|rate|cost/, 45],
  [/contact|location|visit|find-us|hours/, 38],
  [/faq|question|help|support/, 36],
  [/team|doctor|staff|people|expert/, 28],
  [/book|appointment|schedule|reserv|consult|demo|call/, 34],
  [/work|case-stud|portfolio|client/, 18],
];
const DEPRIORITISED =
  /\/(blog|news|tag|tags|category|author|page|feed|wp-|cart|checkout|account|login|signin|signup|register|privacy|terms|cookie|legal|careers|jobs|sitemap)(\/|$)/;
const ASSET = /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|mp4|mp3|webm|css|js|json|xml|woff2?|ttf|eot)$/i;

type Robots = { allow: string[]; disallow: string[] };

/** Fetches with manual redirects so every hop is re-validated against private address ranges. */
async function safeFetch(start: URL, timeoutMs: number, signal?: AbortSignal): Promise<{ url: URL; res: Response }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);
    const timeout = AbortSignal.timeout(timeoutMs);
    const res = await fetch(url, {
      redirect: "manual",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "Accept-Language": "en-IN,en;q=0.9,hi;q=0.6",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location) throw new OnboardError("The site redirected without a destination.", "unreachable");
      const next = new URL(location, url);
      if (next.protocol !== "http:" && next.protocol !== "https:") throw new OnboardError("Redirected to an unsupported scheme.", "blocked_host");
      url = next;
      continue;
    }
    return { url, res };
  }
  throw new OnboardError("Too many redirects.", "unreachable");
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
    if (total > MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

function parseRobots(body: string): Robots {
  const rules: Robots = { allow: [], disallow: [] };
  let applies = false;
  let inAgentBlock = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === "user-agent") {
      if (!inAgentBlock) applies = false;
      inAgentBlock = true;
      if (value === "*") applies = true;
      continue;
    }
    inAgentBlock = false;
    if (!applies) continue;
    if (key === "disallow" && value) rules.disallow.push(value);
    if (key === "allow" && value) rules.allow.push(value);
  }
  return rules;
}

function robotsPattern(rule: string): RegExp {
  const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped.endsWith("\\$") ? `${escaped.slice(0, -2)}$` : escaped}`);
}

/** Longest matching rule wins, as in the robots exclusion standard. */
function robotsAllows(robots: Robots, path: string): boolean {
  let best: { length: number; allow: boolean } | null = null;
  for (const [list, allow] of [[robots.disallow, false], [robots.allow, true]] as const) {
    for (const rule of list) {
      if (robotsPattern(rule).test(path) && (!best || rule.length > best.length || (rule.length === best.length && allow))) {
        best = { length: rule.length, allow };
      }
    }
  }
  return best?.allow ?? true;
}

async function fetchRobots(origin: URL, signal?: AbortSignal): Promise<Robots> {
  try {
    const { res } = await safeFetch(new URL("/robots.txt", origin), 4000, signal);
    if (!res.ok) {
      await res.body?.cancel();
      return { allow: [], disallow: [] };
    }
    return parseRobots((await readCapped(res)).slice(0, 200_000));
  } catch {
    return { allow: [], disallow: [] };
  }
}

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

function canonical(url: URL): string {
  const u = new URL(url);
  u.hash = "";
  u.search = "";
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString();
}

function scoreLink(url: URL, anchor: string): number {
  const path = url.pathname.toLowerCase();
  const haystack = `${path} ${anchor.toLowerCase()}`;
  let score = 0;
  for (const [pattern, bonus] of PRIORITY) if (pattern.test(haystack)) score = Math.max(score, bonus);
  const depth = path.split("/").filter(Boolean).length;
  score -= depth * 6;
  if (DEPRIORITISED.test(path)) score -= 50;
  return score;
}

const BLOCK_TAGS = "p,div,section,article,main,aside,header,ul,ol,dl,dt,dd,table,thead,tbody,tr,blockquote,figure,figcaption,address,form,fieldset,details,summary";

/** Turns a document into readable text that keeps headings, lists and table rows. */
export function extractPage(html: string, pageUrl: URL): { title: string; description: string; text: string; links: Array<{ url: URL; anchor: string }> } {
  const $ = cheerio.load(html);
  const meta = (name: string) =>
    $(`meta[name="${name}"]`).attr("content")?.trim() || $(`meta[property="${name}"]`).attr("content")?.trim() || "";
  const title = ($("title").first().text().trim() || meta("og:title")).slice(0, 200);
  const description = (meta("description") || meta("og:description") || meta("twitter:description")).slice(0, 500);

  const jsonLd: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (raw) jsonLd.push(compactJsonLd(raw));
  });

  const links: Array<{ url: URL; anchor: string }> = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;
    try {
      links.push({ url: new URL(href, pageUrl), anchor: $(el).text().replace(/\s+/g, " ").trim().slice(0, 80) });
    } catch {
      return;
    }
  });

  $("script,style,noscript,svg,iframe,canvas,template,nav,footer,[aria-hidden='true'],[hidden],button[aria-label*='menu' i]").remove();
  $("br").replaceWith("\n");
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    $(el).prepend("\n## ").append("\n");
  });
  $("li").each((_, el) => {
    $(el).prepend("\n- ").append("\n");
  });
  $("td,th").each((_, el) => {
    $(el).append(" | ");
  });
  $(BLOCK_TAGS).each((_, el) => {
    $(el).append("\n");
  });

  const lines: string[] = [];
  for (const raw of $("body").text().split("\n")) {
    const line = raw.replace(/[ \t ]+/g, " ").replace(/\s*\|\s*$/, "").trim();
    if (line.length < 2 || line === "##" || line === "-") continue;
    if (lines.at(-1) === line) continue;
    lines.push(line);
  }

  const parts = [description ? `Summary: ${description}` : "", lines.join("\n"), jsonLd.length ? `Structured data: ${jsonLd.join(" ")}` : ""];
  return { title, description, text: parts.filter(Boolean).join("\n").slice(0, MAX_PAGE_CHARS), links };
}

/** Keeps the JSON-LD fields that describe a business and drops images, ids and boilerplate. */
function compactJsonLd(raw: string): string {
  const keep = new Set(["@type", "name", "description", "telephone", "email", "address", "streetAddress", "addressLocality", "addressRegion", "postalCode", "addressCountry", "openingHours", "openingHoursSpecification", "dayOfWeek", "opens", "closes", "priceRange", "offers", "price", "priceCurrency", "makesOffer", "itemOffered", "areaServed", "founder", "foundingDate", "sameAs", "hasOfferCatalog", "itemListElement", "serviceType", "provider", "@graph", "mainEntity", "acceptedAnswer", "text"]);
  const prune = (value: unknown, depth: number): unknown => {
    if (depth > 6) return undefined;
    if (Array.isArray(value)) return value.slice(0, 20).map((v) => prune(v, depth + 1)).filter((v) => v !== undefined);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (!keep.has(k)) continue;
        const pruned = prune(v, depth + 1);
        if (pruned !== undefined && !(Array.isArray(pruned) && pruned.length === 0)) out[k] = pruned;
      }
      return Object.keys(out).length ? out : undefined;
    }
    if (typeof value === "string") return value.slice(0, 400);
    return value;
  };
  try {
    return JSON.stringify(prune(JSON.parse(raw), 0) ?? {}).slice(0, 2500);
  } catch {
    return "";
  }
}

/**
 * Breadth first, priority ordered crawl of one site. Pages that describe the business
 * (about, services, pricing, contact, faq) are fetched first; the crawl stops at the page
 * cap or the time budget, whichever comes first.
 */
export async function crawlSite(start: URL, options: CrawlOptions = {}): Promise<{ origin: string; pages: CrawledPage[] }> {
  const maxPages = options.maxPages ?? 12;
  const pageTimeoutMs = options.pageTimeoutMs ?? 8000;
  const deadline = Date.now() + (options.budgetMs ?? 25_000);
  const concurrency = options.concurrency ?? 4;
  const { signal, onProgress } = options;

  let home: { url: URL; res: Response };
  try {
    home = await safeFetch(start, pageTimeoutMs, signal);
  } catch (err) {
    if (err instanceof OnboardError) throw err;
    const reason = err instanceof Error && err.name === "TimeoutError" ? "did not respond within 8 seconds" : "could not be reached";
    throw new OnboardError(`${start.hostname} ${reason}.`, "unreachable");
  }
  if (!home.res.ok) {
    await home.res.body?.cancel();
    throw new OnboardError(`${home.url.hostname} answered with HTTP ${home.res.status}.`, "unreachable");
  }
  const origin = new URL(home.url.origin);
  const robots = await fetchRobots(origin, signal);
  const host = bareHost(origin.hostname);

  const seen = new Set<string>();
  const frontier: Array<{ url: URL; score: number }> = [];
  const pages: CrawledPage[] = [];

  const enqueue = (url: URL, anchor: string) => {
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (bareHost(url.hostname) !== host || ASSET.test(url.pathname)) return;
    const key = canonical(url);
    if (seen.has(key)) return;
    seen.add(key);
    if (!robotsAllows(robots, url.pathname)) {
      onProgress?.({ kind: "skipped", url: key, reason: "robots.txt" });
      return;
    }
    frontier.push({ url: new URL(key), score: scoreLink(url, anchor) });
  };

  const ingest = async (url: URL, res: Response) => {
    const type = res.headers.get("content-type") ?? "";
    const isText = type.includes("text/plain") && url.pathname.endsWith(".txt");
    if (!type.includes("html") && !isText) {
      await res.body?.cancel();
      return;
    }
    const body = await readCapped(res);
    if (isText) {
      const text = body.slice(0, MAX_PAGE_CHARS).trim();
      if (text.length > 40) {
        pages.push({ url: canonical(url), title: url.pathname.slice(1), description: "", text });
        onProgress?.({ kind: "page", url: canonical(url), title: url.pathname.slice(1), index: pages.length, chars: text.length });
      }
      return;
    }
    const page = extractPage(body, url);
    for (const link of page.links) enqueue(link.url, link.anchor);
    if (page.text.length < 40) return;
    pages.push({ url: canonical(url), title: page.title || url.pathname, description: page.description, text: page.text });
    onProgress?.({ kind: "page", url: canonical(url), title: page.title || url.pathname, index: pages.length, chars: page.text.length });
  };

  seen.add(canonical(home.url));
  await ingest(home.url, home.res);
  enqueue(new URL("/llms.txt", origin), "llms.txt");
  // Client rendered sites often ship no links in HTML; probe the pages most businesses have.
  if (frontier.length < 4) {
    for (const path of ["/about", "/services", "/pricing", "/contact", "/faq"]) enqueue(new URL(path, origin), path);
  }

  let inFlight = 0;
  const worker = async () => {
    while (pages.length + inFlight < maxPages && Date.now() < deadline && !signal?.aborted) {
      frontier.sort((a, b) => b.score - a.score);
      const next = frontier.shift();
      if (!next) return;
      inFlight += 1;
      try {
        const remaining = Math.max(1000, Math.min(pageTimeoutMs, deadline - Date.now()));
        const { url, res } = await safeFetch(next.url, remaining, signal);
        if (bareHost(url.hostname) !== host) {
          await res.body?.cancel();
          continue;
        }
        if (!res.ok) {
          await res.body?.cancel();
          continue;
        }
        const key = canonical(url);
        if (key !== canonical(next.url) && pages.some((p) => p.url === key)) {
          await res.body?.cancel();
          continue;
        }
        await ingest(url, res);
      } catch (err) {
        onProgress?.({ kind: "skipped", url: next.url.toString(), reason: err instanceof Error ? err.message : "fetch failed" });
      } finally {
        inFlight -= 1;
      }
    }
  };
  // Workers that find an empty frontier exit early; restart them while new links keep arriving.
  while (pages.length < maxPages && Date.now() < deadline && frontier.length > 0 && !signal?.aborted) {
    await Promise.all(Array.from({ length: Math.min(concurrency, frontier.length) }, worker));
  }

  const deduped = dropBoilerplate(pages.slice(0, maxPages));
  const total = deduped.reduce((n, p) => n + p.text.length, 0);
  if (total < 120) {
    throw new OnboardError("The site returned almost no readable text. It may require JavaScript or block automated visits.", "no_content");
  }
  return { origin: origin.toString(), pages: deduped };
}

/** Lines that repeat on most pages (menus, cookie banners, footers) add noise to retrieval. */
function dropBoilerplate(pages: CrawledPage[]): CrawledPage[] {
  if (pages.length < 3) return pages;
  const counts = new Map<string, number>();
  for (const page of pages) for (const line of new Set(page.text.split("\n"))) counts.set(line, (counts.get(line) ?? 0) + 1);
  const threshold = Math.max(3, Math.ceil(pages.length * 0.6));
  return pages.map((page, i) =>
    i === 0
      ? page
      : { ...page, text: page.text.split("\n").filter((line) => line.length > 60 || (counts.get(line) ?? 0) < threshold).join("\n") },
  );
}
