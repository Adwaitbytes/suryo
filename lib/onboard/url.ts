import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class OnboardError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_url" | "blocked_host" | "unreachable" | "no_content" | "extraction_failed" | "timeout",
  ) {
    super(message);
  }
}

/** Parses operator input like "slowbroslabs.com" into a normalised http(s) URL. */
export function parseSiteUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) throw new OnboardError("Enter a website address.", "invalid_url");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new OnboardError("That does not look like a website address.", "invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new OnboardError("Only http and https websites can be onboarded.", "invalid_url");
  }
  if (url.username || url.password) throw new OnboardError("Addresses with credentials are not allowed.", "invalid_url");
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new OnboardError("Only standard web ports are allowed.", "invalid_url");
  }
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") && isIP(host) === 0) throw new OnboardError("Use a public domain name.", "invalid_url");
  url.hash = "";
  return url;
}

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function ipv6Private(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith("64:ff9b:") || v.startsWith("2001:db8");
}

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return ipv4Private(ip);
  if (family === 6) return ipv6Private(ip);
  return true;
}

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa"];

/**
 * Resolves the host and refuses loopback, private, link local and metadata ranges so the
 * crawler cannot be pointed at internal infrastructure. Checked again on every redirect hop.
 */
export async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new OnboardError("Local and internal addresses cannot be onboarded.", "blocked_host");
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new OnboardError("Private network addresses cannot be onboarded.", "blocked_host");
    return;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new OnboardError(`Could not find ${host}. Check the address and try again.`, "unreachable");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new OnboardError("That domain points to a private network address.", "blocked_host");
  }
}
