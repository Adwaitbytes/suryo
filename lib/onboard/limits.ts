/**
 * Upload limits shared by the browser and the server. Vercel functions reject request bodies
 * above 4.5 MB before our code runs, so the request total is the hard ceiling.
 */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 4.5 * 1024 * 1024;
export const MAX_FILES = 8;

export const DOCUMENT_KINDS = ["pdf", "docx", "txt", "md", "csv"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

const EXTENSIONS: Record<string, DocumentKind> = {
  pdf: "pdf",
  docx: "docx",
  txt: "txt",
  text: "txt",
  md: "md",
  markdown: "md",
  csv: "csv",
};

export const ACCEPT_ATTRIBUTE = ".pdf,.docx,.txt,.md,.markdown,.csv";

export function kindFromName(name: string): DocumentKind | null {
  const ext = name.toLowerCase().match(/\.([a-z]+)$/)?.[1];
  return ext ? (EXTENSIONS[ext] ?? null) : null;
}

export const SOURCE_PREFIX = "doc://";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

/** Problems a browser can catch before uploading. The server repeats every check and adds magic bytes. */
export function checkSelection(files: Array<{ name: string; size: number }>): string[] {
  const problems: string[] = [];
  if (files.length > MAX_FILES) problems.push(`Upload at most ${MAX_FILES} files at a time.`);
  for (const f of files) {
    if (!kindFromName(f.name)) problems.push(`${f.name} is not a supported type. Use PDF, DOCX, TXT, MD or CSV.`);
    else if (f.size === 0) problems.push(`${f.name} is empty.`);
    else if (f.size > MAX_FILE_BYTES) problems.push(`${f.name} is ${formatBytes(f.size)}. Each file can be up to ${formatBytes(MAX_FILE_BYTES)}.`);
  }
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_REQUEST_BYTES) problems.push(`These files add up to ${formatBytes(total)}. One upload can carry up to ${formatBytes(MAX_REQUEST_BYTES)}.`);
  return problems;
}
