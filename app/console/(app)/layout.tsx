import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ConsoleShell } from "@/components/console/shell";
import { OPERATOR_COOKIE, keyMatches } from "@/lib/console/http";

export const metadata: Metadata = { title: { default: "Console", template: "%s · Suryo Console" } };

export default async function ConsoleLayout({ children }: LayoutProps<"/console">) {
  if (process.env.OPERATOR_KEY) {
    const cookie = (await cookies()).get(OPERATOR_COOKIE)?.value;
    if (!cookie || !keyMatches(cookie)) redirect("/console/login");
  }
  return <ConsoleShell>{children}</ConsoleShell>;
}
