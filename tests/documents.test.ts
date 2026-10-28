import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { BusinessProfile } from "@/lib/contracts";
import { chunkPages } from "@/lib/onboard/chunk";
import { assertContentMatches, cleanFileName, NO_TEXT_MESSAGE, parseCsv, parseDocument, readUploads } from "@/lib/onboard/documents";
import { checkSelection, kindFromName, MAX_FILE_BYTES } from "@/lib/onboard/limits";
import { mergeProfile } from "@/lib/onboard/merge";
import { OnboardError } from "@/lib/onboard/url";

const utf8 = (s: string) => new TextEncoder().encode(s);

async function pdf(pages: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([595, 842]);
    lines.forEach((text, i) => page.drawText(text, { x: 50, y: 780 - i * 18, size: 11, font }));
  }
  return doc.save();
}

const baseProfile: BusinessProfile = {
  name: "Pulse Physio Studio",
  tagline: "",
  description: "Physiotherapy clinic",
  industry: "Healthcare",
  services: [{ name: "Initial assessment", description: "", price: "" }],
  hours: [],
  locations: [],
  contact: { phone: "+91 731 498 2210", email: "", whatsapp: "" },
  bookingRules: ["Cancel at least 4 hours before."],
  bookableOffering: "Initial assessment",
  toneOfVoice: "Operator written tone",
  languages: ["English"],
};

describe("upload validation", () => {
  it("maps extensions to kinds and rejects everything else", () => {
    expect(kindFromName("Menu.PDF")).toBe("pdf");
    expect(kindFromName("faq.docx")).toBe("docx");
    expect(kindFromName("notes.markdown")).toBe("md");
    expect(kindFromName("setup.exe")).toBeNull();
    expect(kindFromName("photo.png")).toBeNull();
  });

  it("reports size, count and type problems before upload", () => {
    const problems = checkSelection([
      { name: "a.pdf", size: MAX_FILE_BYTES + 1 },
      { name: "b.exe", size: 10 },
    ]);
    expect(problems.some((p) => p.startsWith("a.pdf is"))).toBe(true);
    expect(problems.some((p) => p.startsWith("b.exe is not a supported type"))).toBe(true);
    expect(checkSelection(Array.from({ length: 9 }, (_, i) => ({ name: `${i}.txt`, size: 1 })))[0]).toContain("at most 8");
  });

  it("checks magic bytes against the extension", () => {
    expect(() => assertContentMatches("fake.pdf", "pdf", utf8("just text"))).toThrow(/not a valid PDF/);
    expect(() => assertContentMatches("old.docx", "docx", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).toThrow(/older Word/);
    expect(() => assertContentMatches("zip.txt", "txt", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]))).toThrow(/binary/);
    expect(() => assertContentMatches("bin.csv", "csv", new Uint8Array([0x41, 0x00, 0x42]))).toThrow(/binary/);
    expect(() => assertContentMatches("ok.md", "md", utf8("# Hello"))).not.toThrow();
  });

  it("rejects unsupported files in a multipart upload", async () => {
    const exe = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0])], "setup.exe");
    await expect(readUploads([exe])).rejects.toThrow(/not a supported type/);
    await expect(readUploads([])).rejects.toThrow(/at least one/);
  });

  it("strips paths and markup from file names and dedupes repeats", async () => {
    expect(cleanFileName('../../etc/<script>"x".txt')).toBe("scriptx.txt");
    const docs = await readUploads([new File(["Price list text here"], "prices.txt"), new File(["Another price list"], "prices.txt")]);
    expect(docs.map((d) => d.name)).toEqual(["prices.txt", "prices (2).txt"]);
  });
});

describe("document parsing", () => {
  it("reads PDF pages and titles chunks with the file name and page", async () => {
    const bytes = await pdf([
      ["Pulse Physio Studio", "Initial assessment Rs. 900", "Follow up session Rs. 700"],
      ["Clinic hours", "Monday to Friday 8:00 am to 8:00 pm"],
    ]);
    const doc = await parseDocument({ name: "brochure.pdf", kind: "pdf", bytes });
    expect(doc.pages).toBe(2);
    expect(doc.sourceUrl).toBe("doc://brochure.pdf");
    expect(doc.parts[0].text).toContain("Rs. 900");
    expect(doc.parts[1].title).toBe("brochure.pdf · page 2");
    const chunks = chunkPages(doc.parts);
    expect(chunks.every((c) => c.sourceUrl === "doc://brochure.pdf")).toBe(true);
  });

  it("rejects a PDF without selectable text with the scanned PDF message", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]).drawRectangle({ x: 40, y: 40, width: 400, height: 600, color: rgb(0.8, 0.8, 0.8) });
    const bytes = await doc.save();
    const run = parseDocument({ name: "scan.pdf", kind: "pdf", bytes });
    await expect(run).rejects.toBeInstanceOf(OnboardError);
    await expect(run).rejects.toThrow(NO_TEXT_MESSAGE);
  });

  it("keeps markdown headings as sections", async () => {
    const doc = await parseDocument({ name: "faq.md", kind: "md", bytes: utf8("# FAQ\n\n## Parking\nFree basement parking for two hours at the clinic building.") });
    expect(doc.parts[0].text).toContain("## Parking");
    expect(chunkPages(doc.parts)[0].title).toBe("faq.md · Parking");
  });

  it("parses quoted CSV fields and labels values with their header", async () => {
    expect(parseCsv('Service,Price\n"Dry needling, add on","Rs. 500"\n')).toEqual([
      ["Service", "Price"],
      ["Dry needling, add on", "Rs. 500"],
    ]);
    const doc = await parseDocument({ name: "prices.csv", kind: "csv", bytes: utf8("Service,Price\nHome visit,Rs. 1500\n") });
    expect(doc.parts[0].text).toBe("Service: Home visit; Price: Rs. 1500");
  });
});

describe("profile merge", () => {
  it("fills empty fields and appends new items without touching operator edits", () => {
    const { profile, changes } = mergeProfile(baseProfile, {
      ...baseProfile,
      tagline: "Sports physio in Indore",
      toneOfVoice: "Extracted tone",
      services: [
        { name: "Initial Assessment", description: "45 minutes", price: "Rs. 900" },
        { name: "Home visit", description: "", price: "Rs. 1,500" },
      ],
      hours: [{ day: "mon", open: "08:00", close: "20:00" }],
      contact: { phone: "+91 99999 99999", email: "care@pulsephysio.in", whatsapp: "" },
      bookingRules: ["Cancel at least 4 hours before.", "Bring your reports."],
      languages: ["English", "Hindi"],
    });
    expect(profile.toneOfVoice).toBe("Operator written tone");
    expect(profile.tagline).toBe("Sports physio in Indore");
    expect(profile.contact.phone).toBe("+91 731 498 2210");
    expect(profile.contact.email).toBe("care@pulsephysio.in");
    expect(profile.services).toEqual([
      { name: "Initial assessment", description: "45 minutes", price: "Rs. 900" },
      { name: "Home visit", description: "", price: "Rs. 1,500" },
    ]);
    expect(profile.hours).toHaveLength(1);
    expect(profile.bookingRules).toEqual(["Cancel at least 4 hours before.", "Bring your reports."]);
    expect(profile.languages).toEqual(["English", "Hindi"]);
    expect(changes).toContain("1 new service");
  });

  it("keeps existing hours", () => {
    const current = { ...baseProfile, hours: [{ day: "tue" as const, open: "10:00", close: "18:00" }] };
    const { profile } = mergeProfile(current, { ...baseProfile, hours: [{ day: "mon", open: "08:00", close: "20:00" }] });
    expect(profile.hours).toEqual(current.hours);
  });
});
