import type { BusinessProfile } from "@/lib/contracts";
import type { CrawledPage } from "./crawl";

export type Chunk = { title: string; sourceUrl: string | null; content: string };

const TARGET = 700;
const OVERLAP = 120;
const MAX_CHUNKS = 48;
/** Uploaded documents are the owner's own material and usually denser than web pages, so they get a larger share. */
export const MAX_CHUNKS_WITH_DOCUMENTS = 96;
/** Source of the profile fact sheet when there is no website to attribute it to. */
export const OVERVIEW_SOURCE = "suryo://overview";

/**
 * Splits page text on line boundaries into roughly 700 character chunks with a short
 * overlap, so a fact that straddles a boundary is still retrievable from one chunk.
 * Each chunk keeps the nearest heading so it reads on its own. The embedding quota is per
 * passage, so the total is capped and shared fairly between pages.
 */
export function chunkPages(pages: CrawledPage[], maxChunks = MAX_CHUNKS): Chunk[] {
  const seen = new Set<string>();
  const perPage: Chunk[][] = [];
  for (const page of pages) {
    const chunks: Chunk[] = [];
    perPage.push(chunks);
    let heading = "";
    let buffer: string[] = [];
    let size = 0;
    let fresh = 0;
    const flush = () => {
      const body = buffer.join("\n").trim();
      if (body.length >= 60) {
        const key = body.toLowerCase().replace(/\s+/g, " ");
        if (!seen.has(key)) {
          seen.add(key);
          chunks.push({ title: heading ? `${page.title} · ${heading}` : page.title, sourceUrl: page.url, content: body });
        }
      }
      const tail: string[] = [];
      let tailSize = 0;
      for (let i = buffer.length - 1; i >= 0 && tailSize < OVERLAP; i--) {
        tail.unshift(buffer[i]);
        tailSize += buffer[i].length;
      }
      buffer = tailSize < body.length ? tail : [];
      size = buffer.reduce((n, l) => n + l.length + 1, 0);
      fresh = 0;
    };
    for (const rawLine of page.text.split("\n")) {
      for (const line of splitLong(rawLine)) {
        if (size + line.length > TARGET && size > 0) flush();
        if (line.startsWith("## ")) heading = line.slice(3).slice(0, 80);
        buffer.push(line);
        size += line.length + 1;
        fresh += 1;
      }
    }
    if (fresh > 0) flush();
  }
  // Round robin across pages so a long homepage cannot crowd out the contact or pricing page.
  const out: Chunk[] = [];
  for (let round = 0; out.length < maxChunks && perPage.some((c) => c.length > round); round++) {
    for (const chunks of perPage) if (chunks[round] && out.length < maxChunks) out.push(chunks[round]);
  }
  return out;
}

function splitLong(line: string): string[] {
  if (line.length <= TARGET) return [line];
  const parts: string[] = [];
  let rest = line;
  while (rest.length > TARGET) {
    const cut = Math.max(rest.lastIndexOf(". ", TARGET), rest.lastIndexOf(" ", TARGET), TARGET / 2);
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1);
  }
  if (rest.trim()) parts.push(rest.trim());
  return parts;
}

/**
 * A compact fact sheet built from the extracted profile, so questions like "what are your
 * hours" retrieve one precise passage. Everything in it was extracted from the crawled pages
 * or uploaded documents.
 */
export function profileChunk(profile: BusinessProfile, website: string | null): Chunk {
  const lines = [
    `${profile.name}: ${profile.description}`,
    profile.services.length
      ? `Services: ${profile.services.map((s) => `${s.name}${s.price ? ` (${s.price})` : ""}`).join("; ")}`
      : "",
    profile.hours.length
      ? `Hours: ${profile.hours.map((h) => `${h.day} ${h.open && h.close ? `${h.open} to ${h.close}` : "closed"}`).join(", ")}`
      : "",
    profile.locations.length ? `Locations: ${profile.locations.map((l) => `${l.name}${l.address ? `, ${l.address}` : ""}`).join(" | ")}` : "",
    [profile.contact.phone && `Phone ${profile.contact.phone}`, profile.contact.email && `Email ${profile.contact.email}`, profile.contact.whatsapp && `WhatsApp ${profile.contact.whatsapp}`]
      .filter(Boolean)
      .join(". "),
    profile.bookingRules.length ? `Booking: ${profile.bookingRules.join(" ")}` : "",
    `You can book a ${profile.bookableOffering} directly with the assistant.`,
  ];
  return { title: `${profile.name} overview`, sourceUrl: website, content: lines.filter(Boolean).join("\n") };
}
