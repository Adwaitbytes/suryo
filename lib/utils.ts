import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatInr(amount: number | null | undefined): string {
  if (amount == null) return "";
  return `₹${amount.toLocaleString("en-IN")}`;
}
