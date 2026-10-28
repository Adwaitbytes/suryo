import type { BusinessProfile } from "@/lib/contracts";

const MAX_SERVICES = 20;
const MAX_RULES = 10;
const MAX_LOCATIONS = 5;
const MAX_LANGUAGES = 8;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, " ").trim();

export type ProfileMerge = { profile: BusinessProfile; changes: string[] };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Folds a profile extracted from newly added documents into the live one without overwriting
 * anything the operator already has: empty fields are filled, new services, rules, locations
 * and languages are appended, and hours are taken only when none are set.
 */
export function mergeProfile(current: BusinessProfile, found: BusinessProfile): ProfileMerge {
  const changes: string[] = [];
  const fill = <K extends "tagline" | "description" | "industry" | "toneOfVoice">(field: K, label: string) => {
    if (!current[field].trim() && found[field].trim()) {
      changes.push(label);
      return found[field];
    }
    return current[field];
  };

  const services = current.services.map((s) => ({ ...s }));
  let added = 0;
  let priced = 0;
  for (const s of found.services) {
    if (!s.name.trim()) continue;
    const match = services.find((x) => key(x.name) === key(s.name));
    if (match) {
      if (!match.price.trim() && s.price.trim()) {
        match.price = s.price;
        priced += 1;
      }
      if (!match.description.trim() && s.description.trim()) match.description = s.description;
    } else if (services.length < MAX_SERVICES) {
      services.push({ ...s });
      added += 1;
    }
  }
  if (added) changes.push(plural(added, "new service"));
  if (priced) changes.push(plural(priced, "price"));

  const hasHours = current.hours.some((h) => h.open && h.close);
  const takeHours = !hasHours && found.hours.some((h) => h.open && h.close);
  if (takeHours) changes.push("opening hours");

  const rules = [...current.bookingRules];
  const ruleKeys = new Set(rules.map(key));
  let newRules = 0;
  for (const r of found.bookingRules) {
    if (rules.length >= MAX_RULES) break;
    if (!r.trim() || ruleKeys.has(key(r))) continue;
    rules.push(r);
    ruleKeys.add(key(r));
    newRules += 1;
  }
  if (newRules) changes.push(plural(newRules, "booking rule"));

  const locations = [...current.locations];
  let newLocations = 0;
  for (const l of found.locations) {
    if (locations.length >= MAX_LOCATIONS) break;
    const k = key(l.address || l.name);
    if (!k || locations.some((x) => key(x.address || x.name) === k)) continue;
    locations.push(l);
    newLocations += 1;
  }
  if (newLocations) changes.push(plural(newLocations, "location"));

  const contact = { ...current.contact };
  for (const field of ["phone", "email", "whatsapp"] as const) {
    if (!contact[field].trim() && found.contact[field].trim()) {
      contact[field] = found.contact[field];
      changes.push(field === "whatsapp" ? "WhatsApp number" : field === "phone" ? "phone number" : "email");
    }
  }

  const languages = [...current.languages];
  for (const lang of found.languages) {
    if (languages.length < MAX_LANGUAGES && !languages.some((x) => key(x) === key(lang))) languages.push(lang);
  }
  if (languages.length > current.languages.length) changes.push(plural(languages.length - current.languages.length, "language"));

  const profile: BusinessProfile = {
    ...current,
    tagline: fill("tagline", "tagline"),
    description: fill("description", "description"),
    industry: fill("industry", "industry"),
    toneOfVoice: fill("toneOfVoice", "tone of voice"),
    services,
    hours: takeHours ? found.hours : current.hours,
    bookingRules: rules,
    locations,
    contact,
    languages,
  };
  return { profile, changes };
}
