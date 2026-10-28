/** Keeps the country code and last three digits so staff can recognise a number without exposing it. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "•••";
  const tail = digits.slice(-3);
  const head = phone.trim().startsWith("+") ? `+${digits.slice(0, digits.length > 10 ? digits.length - 10 : 0)}` : "";
  return `${head ? `${head} ` : ""}${"•".repeat(Math.max(3, Math.min(digits.length, 10) - 3))}${tail}`;
}

export function maskEmailAddress(email: string | null | undefined): string | null {
  if (!email) return null;
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(user.length - 2, 6)))}@${domain}`;
}
