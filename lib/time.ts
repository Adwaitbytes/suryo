import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const TZ = "Asia/Kolkata";

/** Human description of "now" that anchors relative dates like "kal shaam" for the model. */
export function nowContext(date = new Date()): string {
  return formatInTimeZone(date, TZ, "EEEE d MMMM yyyy, h:mm a 'IST' (yyyy-MM-dd)");
}

export function todayIso(date = new Date()): string {
  return formatInTimeZone(date, TZ, "yyyy-MM-dd");
}

export function formatSlot(date: Date | string): string {
  return formatInTimeZone(new Date(date), TZ, "EEE d MMM, h:mm a");
}

export function formatTime(date: Date | string): string {
  return formatInTimeZone(new Date(date), TZ, "h:mm a");
}

/** Converts a local IST wall-clock date and time into a UTC instant. */
export function istToUtc(dateIso: string, time = "00:00"): Date {
  return fromZonedTime(`${dateIso}T${time}:00`, TZ);
}

export const TIME_WINDOWS = {
  morning: ["08:00", "12:00"],
  afternoon: ["12:00", "16:00"],
  evening: ["16:00", "21:00"],
  any: ["00:00", "23:59"],
} as const;
export type TimeWindow = keyof typeof TIME_WINDOWS;

export function addDaysIso(dateIso: string, days: number): string {
  const d = istToUtc(dateIso, "12:00");
  d.setUTCDate(d.getUTCDate() + days);
  return todayIso(d);
}
