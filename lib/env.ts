import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(10),
  GEMINI_API_KEY: z.string().min(10),
  SMTP_USER: z.string().email().optional(),
  SMTP_PASSWORD: z.string().min(4).optional(),
  APP_URL: z.string().url().optional(),
  OPERATOR_KEY: z.string().min(8).optional(),
});

type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated server environment. Throws once, loudly, if configuration is wrong. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}

export function appUrl(): string {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
