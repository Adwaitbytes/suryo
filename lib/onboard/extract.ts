import { generateText, Output } from "ai";
import { z } from "zod";
import { CLASSIFIER_OPTIONS, classifierModel, strongModel } from "@/lib/ai/models";
import { businessProfileSchema, type BusinessProfile, type Persona } from "@/lib/contracts";
import type { CrawledPage } from "./crawl";
import { OnboardError } from "./url";

const MAX_PROMPT_CHARS = 26_000;

export const LIVE_VOICES = ["Aoede", "Kore", "Puck", "Charon", "Fenrir", "Leda", "Orus", "Zephyr"] as const;

const personaOutputSchema = z.object({
  agentName: z.string().describe("A short, warm first name that fits the brand and its market"),
  greeting: z.string().describe("Spoken greeting in the brand's tone, one or two short sentences, names the business"),
  style: z.string().describe("Two or three short sentences on how the agent speaks"),
  voice: z.enum(LIVE_VOICES),
});

const PROFILE_SYSTEM = `You turn a company's website into the configuration for its AI front desk agent.
Rules:
- Use only facts stated in the pages. Never guess. Unknown text fields are empty strings, unknown lists are empty arrays.
- services: the distinct offerings customers can buy (at most 12). price is copied exactly as published, including currency and qualifiers like "from" or "per month". If no price is published for that service, price is "".
- hours: only if opening hours are published, one entry per day mon to sun, 24h HH:mm, open and close "" for closed days. Otherwise [].
- locations: physical addresses if published. Online only businesses get [].
- bookingRules: policies a front desk must know (lead time, cancellation, deposits, eligibility). Short sentences.
- bookableOffering: what a customer can book with this agent. Appointment based businesses use their main appointment type. Agencies, software and service firms use "Strategy call", "Consultation", "Discovery call" or "Callback", whichever the site uses or implies.
- toneOfVoice: how the brand writes, in one sentence.
- languages: languages the business serves customers in. Default ["English"].
- No em dashes.`;

function promptFromPages(pages: CrawledPage[]): string {
  const parts: string[] = [];
  let used = 0;
  for (const page of pages) {
    const room = MAX_PROMPT_CHARS - used;
    if (room < 400) break;
    const body = `PAGE ${page.title} (${page.url})\n${page.text.slice(0, Math.min(room, 5000))}`;
    parts.push(body);
    used += body.length;
  }
  return parts.join("\n\n");
}

const stripDashes = (s: string) => s.replace(/\s*[\u2014\u2013]\s*/g, ", ").trim();

function normaliseTime(value: string): string {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return "";
  return `${String(Math.min(h, 23)).padStart(2, "0")}:${String(h === 24 ? 59 : min).padStart(2, "0")}`;
}

/**
 * The model is told never to invent prices; this enforces it. A price survives only if every
 * number in it appears somewhere in the crawled text.
 */
export function groundPrices(profile: BusinessProfile, corpus: string): BusinessProfile {
  const haystack = corpus.replace(/[,\s]/g, "");
  return {
    ...profile,
    services: profile.services.map((s) => {
      const numbers = s.price.match(/\d[\d,.]*/g) ?? [];
      const grounded = numbers.length > 0 && numbers.every((n) => haystack.includes(n.replace(/[,]/g, "").replace(/\.$/, "")));
      return { ...s, price: grounded ? s.price : "" };
    }),
  };
}

function cleanProfile(raw: BusinessProfile, corpus: string): BusinessProfile {
  const days = new Map<string, BusinessProfile["hours"][number]>();
  for (const h of raw.hours) {
    const open = normaliseTime(h.open);
    const close = normaliseTime(h.close);
    days.set(h.day, { day: h.day, open: open && close && open < close ? open : "", close: open && close && open < close ? close : "" });
  }
  const profile: BusinessProfile = {
    name: stripDashes(raw.name).slice(0, 120),
    tagline: stripDashes(raw.tagline).slice(0, 200),
    description: stripDashes(raw.description).slice(0, 1200),
    industry: stripDashes(raw.industry).slice(0, 120),
    services: raw.services.slice(0, 12).map((s) => ({ name: stripDashes(s.name).slice(0, 120), description: stripDashes(s.description).slice(0, 400), price: stripDashes(s.price).slice(0, 120) })),
    hours: [...days.values()],
    locations: raw.locations.slice(0, 5).map((l) => ({ name: stripDashes(l.name).slice(0, 120), address: stripDashes(l.address).slice(0, 300) })),
    contact: { phone: raw.contact.phone.trim().slice(0, 40), email: raw.contact.email.trim().slice(0, 120), whatsapp: raw.contact.whatsapp.trim().slice(0, 40) },
    bookingRules: raw.bookingRules.slice(0, 8).map((r) => stripDashes(r).slice(0, 300)),
    bookableOffering: stripDashes(raw.bookableOffering).slice(0, 60) || "Consultation",
    toneOfVoice: stripDashes(raw.toneOfVoice).slice(0, 300),
    languages: raw.languages.length ? raw.languages.slice(0, 6) : ["English"],
  };
  return groundPrices(profile, corpus);
}

export async function extractProfile(pages: CrawledPage[], signal?: AbortSignal): Promise<{ profile: BusinessProfile; tokens: number }> {
  const corpus = pages.map((p) => p.text).join("\n");
  try {
    const result = await generateText({
      model: strongModel(),
      output: Output.object({ schema: businessProfileSchema }),
      system: PROFILE_SYSTEM,
      prompt: promptFromPages(pages),
      maxOutputTokens: 3000,
      abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
    });
    if (!result.output.name.trim()) throw new OnboardError("Could not tell which business this site belongs to.", "extraction_failed");
    return { profile: cleanProfile(result.output, corpus), tokens: result.usage.totalTokens ?? 0 };
  } catch (err) {
    if (err instanceof OnboardError) throw err;
    throw new OnboardError("Reading the business profile failed. Try again in a moment.", "extraction_failed");
  }
}

/** Falls back to a neutral persona rather than failing onboarding; the caller reports which one it got. */
export async function generatePersona(profile: BusinessProfile, signal?: AbortSignal): Promise<{ persona: Persona; fallback: boolean }> {
  const fallback: Persona = {
    agentName: "Asha",
    greeting: `Hi, you have reached ${profile.name}. How can I help you today?`,
    style: "Short, warm and precise. Answers from the website only and offers to book when it helps.",
    voice: "Kore",
  };
  try {
    const { output } = await generateText({
      model: classifierModel(),
      providerOptions: CLASSIFIER_OPTIONS,
      output: Output.object({ schema: personaOutputSchema }),
      system:
        "You design the voice and chat persona of a business's front desk agent. Match the brand's tone. Plain words, no cliches, no exclamation marks, no emojis, no em dashes. Never claim to be human.",
      prompt: `Business: ${profile.name}\nIndustry: ${profile.industry}\nTagline: ${profile.tagline}\nTone: ${profile.toneOfVoice}\nLanguages: ${profile.languages.join(", ")}\nBookable: ${profile.bookableOffering}`,
      maxOutputTokens: 400,
      abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    });
    const persona: Persona = {
      agentName: stripDashes(output.agentName).split(/\s+/)[0]?.slice(0, 24) || fallback.agentName,
      greeting: stripDashes(output.greeting).slice(0, 240) || fallback.greeting,
      style: stripDashes(output.style).slice(0, 400) || fallback.style,
      voice: output.voice,
    };
    return { persona, fallback: false };
  } catch {
    return { persona: fallback, fallback: true };
  }
}
