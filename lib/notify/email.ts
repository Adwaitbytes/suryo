import { createEvent, type EventAttributes } from "ics";
import nodemailer, { type Transporter } from "nodemailer";
import { formatInTimeZone } from "date-fns-tz";
import { env } from "@/lib/env";
import { TZ } from "@/lib/time";

export type EmailResult =
  | { status: "sent"; providerId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

let transport: Transporter | undefined;

function getTransport(): Transporter | null {
  const { SMTP_USER, SMTP_PASSWORD } = env();
  if (!SMTP_USER || !SMTP_PASSWORD) return null;
  transport ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  return transport;
}

export type CalendarInvite = {
  uid: string;
  title: string;
  description: string;
  location: string;
  start: Date;
  durationMin: number;
  organizerName: string;
  method: "REQUEST" | "CANCEL";
};

export function buildIcs(invite: CalendarInvite): string {
  const parts = formatInTimeZone(invite.start, "UTC", "yyyy-M-d-H-m").split("-").map(Number);
  const attrs: EventAttributes = {
    uid: invite.uid,
    method: invite.method,
    start: parts as [number, number, number, number, number],
    startInputType: "utc",
    startOutputType: "utc",
    duration: { minutes: invite.durationMin },
    title: invite.title,
    description: invite.description,
    location: invite.location,
    status: invite.method === "CANCEL" ? "CANCELLED" : "CONFIRMED",
    organizer: { name: invite.organizerName, email: env().SMTP_USER ?? "noreply@suryo.app" },
    alarms: [{ action: "display", description: "Reminder", trigger: { hours: 2, before: true } }],
  };
  const { error, value } = createEvent(attrs);
  if (error || !value) throw new Error(`Could not build calendar invite: ${String(error)}`);
  return value;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  fromName: string;
  invite?: CalendarInvite;
}): Promise<EmailResult> {
  const t = getTransport();
  if (!t) return { status: "skipped", reason: "Email provider not configured" };
  try {
    const ics = input.invite ? buildIcs(input.invite) : undefined;
    const info = await t.sendMail({
      from: { name: input.fromName, address: env().SMTP_USER ?? "" },
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      icalEvent: ics ? { method: input.invite?.method ?? "REQUEST", content: ics } : undefined,
      attachments: ics ? [{ filename: "appointment.ics", content: ics, contentType: "text/calendar" }] : [],
    });
    return { status: "sent", providerId: info.messageId };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

export function formatForEmail(date: Date): string {
  return formatInTimeZone(date, TZ, "EEEE d MMMM yyyy 'at' h:mm a");
}

/** Plain, branded HTML shell for transactional mail. */
export function emailHtml(opts: { business: string; heading: string; rows: Array<[string, string]>; note: string }): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
  const rows = opts.rows
    .map(([k, v]) => `<tr><td style="padding:8px 0;color:#71717a;font-size:13px;width:120px">${esc(k)}</td><td style="padding:8px 0;color:#18181b;font-size:14px;font-weight:500">${esc(v)}</td></tr>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:14px;border:1px solid #e4e4e7;padding:32px">
<tr><td style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#ea580c;font-weight:600">${esc(opts.business)}</td></tr>
<tr><td style="padding:10px 0 20px;font-size:22px;color:#09090b;font-weight:600">${esc(opts.heading)}</td></tr>
<tr><td><table role="presentation" width="100%" style="border-top:1px solid #f4f4f5;border-bottom:1px solid #f4f4f5">${rows}</table></td></tr>
<tr><td style="padding-top:20px;font-size:13px;line-height:1.6;color:#52525b">${esc(opts.note)}</td></tr>
</table></td></tr></table></body></html>`;
}
