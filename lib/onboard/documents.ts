import * as cheerio from "cheerio";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import type { CrawledPage } from "./crawl";
import { formatBytes, kindFromName, MAX_FILE_BYTES, MAX_FILES, MAX_REQUEST_BYTES, SOURCE_PREFIX, type DocumentKind } from "./limits";
import { OnboardError } from "./url";

export type UploadedDocument = { name: string; kind: DocumentKind; bytes: Uint8Array };

/** One uploaded file as text. Each part is a PDF page or a whole text document, shaped like a crawled page so the chunker and extractor take both. */
export type ParsedDocument = { name: string; kind: DocumentKind; sourceUrl: string; parts: CrawledPage[]; pages: number; chars: number };

const MAX_PDF_PAGES = 80;
const MAX_DOCUMENT_CHARS = 150_000;
const MAX_CSV_ROWS = 2000;

export const NO_TEXT_MESSAGE = "This PDF has no selectable text, export it as text or upload a different file";

/** Keeps only a safe display name: no directories, control characters or markup. */
export function cleanFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f<>"`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 120) return cleaned || "document";
  const ext = cleaned.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? "";
  return `${cleaned.slice(0, 120 - ext.length).trim()}${ext}`;
}

export const sourceUrlFor = (name: string) => `${SOURCE_PREFIX}${name}`;

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((b, i) => bytes[i] === b);
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];

function containsPdfHeader(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length - PDF.length, 1024);
  for (let i = 0; i <= end; i++) if (PDF.every((b, j) => bytes[i + j] === b)) return true;
  return false;
}

/** The extension says what the file claims to be; the leading bytes have to agree. */
export function assertContentMatches(name: string, kind: DocumentKind, bytes: Uint8Array): void {
  if (kind === "pdf") {
    if (!containsPdfHeader(bytes)) throw new OnboardError(`${name} is not a valid PDF file.`, "unsupported_file");
    return;
  }
  if (kind === "docx") {
    if (startsWith(bytes, OLE)) throw new OnboardError(`${name} is an older Word .doc file. Save it as .docx and upload it again.`, "unsupported_file");
    if (!startsWith(bytes, ZIP)) throw new OnboardError(`${name} is not a valid Word .docx file.`, "unsupported_file");
    return;
  }
  if (startsWith(bytes, ZIP) || startsWith(bytes, OLE) || containsPdfHeader(bytes.subarray(0, 1024))) {
    throw new OnboardError(`${name} looks like a binary file, not plain text.`, "unsupported_file");
  }
  const sample = bytes.subarray(0, 64 * 1024);
  let control = 0;
  for (const b of sample) {
    if (b === 0) throw new OnboardError(`${name} looks like a binary file, not plain text.`, "unsupported_file");
    if (b < 0x09 || (b > 0x0d && b < 0x20)) control += 1;
  }
  if (control > sample.length * 0.01) throw new OnboardError(`${name} looks like a binary file, not plain text.`, "unsupported_file");
}

/**
 * Validates a multipart upload: file count, type by extension and leading bytes, per file and
 * total size. Everything is checked before any parsing starts.
 */
export async function readUploads(entries: FormDataEntryValue[]): Promise<UploadedDocument[]> {
  const files = entries.filter((e): e is File => typeof e !== "string");
  if (files.length !== entries.length) throw new OnboardError("Send documents as files.", "unsupported_file");
  if (files.length === 0) throw new OnboardError("Add at least one document.", "unsupported_file");
  if (files.length > MAX_FILES) throw new OnboardError(`Upload at most ${MAX_FILES} files at a time.`, "too_many_files");
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_REQUEST_BYTES) {
    throw new OnboardError(`These files add up to ${formatBytes(total)}. One upload can carry up to ${formatBytes(MAX_REQUEST_BYTES)}.`, "file_too_large");
  }

  const used = new Set<string>();
  const out: UploadedDocument[] = [];
  for (const file of files) {
    let name = cleanFileName(file.name);
    const kind = kindFromName(name);
    if (!kind) throw new OnboardError(`${name} is not a supported type. Use PDF, DOCX, TXT, MD or CSV.`, "unsupported_file");
    if (file.size === 0) throw new OnboardError(`${name} is empty.`, "unsupported_file");
    if (file.size > MAX_FILE_BYTES) throw new OnboardError(`${name} is ${formatBytes(file.size)}. Each file can be up to ${formatBytes(MAX_FILE_BYTES)}.`, "file_too_large");
    const bytes = new Uint8Array(await file.arrayBuffer());
    assertContentMatches(name, kind, bytes);
    if (used.has(name.toLowerCase())) {
      const dot = name.lastIndexOf(".");
      let n = 2;
      while (used.has(`${name.slice(0, dot)} (${n})${name.slice(dot)}`.toLowerCase())) n += 1;
      name = `${name.slice(0, dot)} (${n})${name.slice(dot)}`;
    }
    used.add(name.toLowerCase());
    out.push({ name, kind, bytes });
  }
  return out;
}

const tidy = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    // Dot leaders in price lists ("Assessment ........ Rs. 900") carry no meaning for retrieval.
    .map((l) => l.replace(/[ \t\u00a0]+/g, " ").replace(/ ?(?:\. ?){4,}/g, ": ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    // Spreadsheet exports on Windows are often cp1252; it decodes every byte, so this cannot fail.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

async function pdfPages(doc: UploadedDocument): Promise<string[]> {
  let proxy: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // pdf.js may detach the buffer it is given, so it gets a copy.
    proxy = await getDocumentProxy(doc.bytes.slice());
  } catch (err) {
    if (err instanceof Error && err.name === "PasswordException") {
      throw new OnboardError(`${doc.name} is password protected. Remove the password and upload it again.`, "encrypted");
    }
    throw new OnboardError(`${doc.name} could not be opened. It may be damaged.`, "unsupported_file");
  }
  try {
    const { text } = await extractText(proxy, { mergePages: false });
    return text.slice(0, MAX_PDF_PAGES).map(tidy);
  } catch {
    throw new OnboardError(`${doc.name} could not be read. It may be damaged.`, "unsupported_file");
  } finally {
    await proxy.loadingTask.destroy().catch(() => undefined);
  }
}

/** Word headings become "## " lines so chunks carry the section they came from. */
async function docxText(doc: UploadedDocument): Promise<string> {
  let html: string;
  try {
    ({ value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(doc.bytes) }));
  } catch {
    throw new OnboardError(`${doc.name} could not be read as a Word document.`, "unsupported_file");
  }
  const $ = cheerio.load(html);
  const lines: string[] = [];
  $("h1, h2, h3, h4, h5, h6, p, li, tr").each((_, el) => {
    const node = $(el);
    if (el.tagName === "p" && node.parents("li, td, th").length) return;
    if (el.tagName === "tr") {
      const cells = node
        .children("td, th")
        .map((__, c) => $(c).text().trim())
        .get()
        .filter(Boolean);
      if (cells.length) lines.push(cells.join(" | "));
      return;
    }
    const text = node.text().replace(/\s+/g, " ").trim();
    if (!text) return;
    if (/^h[1-6]$/.test(el.tagName)) lines.push("", `## ${text}`);
    else lines.push(el.tagName === "li" ? `- ${text}` : text);
  });
  return tidy(lines.join("\n"));
}

function markdownText(raw: string): string {
  return tidy(
    raw
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm, "## $1")
      .replace(/(\*\*|__)(.+?)\1/g, "$2"),
  );
}

/** RFC 4180 style rows: quoted fields may hold commas, quotes and newlines. */
export function parseCsv(raw: string): string[][] {
  const delimiter = (raw.split("\n", 1)[0].match(/;/g)?.length ?? 0) > (raw.split("\n", 1)[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quoted) {
      if (c === '"' && raw[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && raw[i + 1] === "\n") i += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
      if (rows.length >= MAX_CSV_ROWS) return rows;
    } else field += c;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

/** Each row reads as "Header: value; Header: value" so a retrieved passage keeps its column meaning. */
function csvText(raw: string): string {
  const [header, ...rows] = parseCsv(raw);
  if (!header) return "";
  if (rows.length === 0) return header.join(", ");
  return rows
    .map((r) =>
      r
        .map((v, i) => (v ? (header[i] ? `${header[i]}: ${v}` : v) : ""))
        .filter(Boolean)
        .join("; "),
    )
    .filter(Boolean)
    .join("\n");
}

export async function parseDocument(doc: UploadedDocument): Promise<ParsedDocument> {
  const sourceUrl = sourceUrlFor(doc.name);
  let texts: Array<{ title: string; text: string }>;
  if (doc.kind === "pdf") {
    const pages = await pdfPages(doc);
    const meaningful = pages.join("").replace(/\s+/g, "").length;
    if (meaningful < 40) throw new OnboardError(`${doc.name}: ${NO_TEXT_MESSAGE}.`, "no_text");
    texts = pages.map((text, i) => ({ title: pages.length > 1 ? `${doc.name} · page ${i + 1}` : doc.name, text })).filter((p) => p.text);
  } else {
    const raw = doc.kind === "docx" ? "" : decodeText(doc.bytes);
    const text = doc.kind === "docx" ? await docxText(doc) : doc.kind === "md" ? markdownText(raw) : doc.kind === "csv" ? csvText(raw) : tidy(raw);
    if (text.replace(/\s+/g, "").length < 20) throw new OnboardError(`${doc.name} has no readable text.`, "no_text");
    texts = [{ title: doc.name, text }];
  }

  let budget = MAX_DOCUMENT_CHARS;
  const parts: CrawledPage[] = [];
  for (const t of texts) {
    if (budget <= 0) break;
    const text = t.text.slice(0, budget);
    budget -= text.length;
    parts.push({ url: sourceUrl, title: t.title, description: "", text });
  }
  return { name: doc.name, kind: doc.kind, sourceUrl, parts, pages: texts.length, chars: parts.reduce((n, p) => n + p.text.length, 0) };
}
