import { BarChart3, BellRing, CalendarCheck2, LifeBuoy, Package, Radio, Target, Ticket, Users, type LucideIcon } from "lucide-react";
import type { BusinessOption } from "@/lib/console/types";

/** kinds limits an item to those business kinds; omitted means every business. */
export type NavItem = { href: string; label: string; icon: LucideIcon; shortcut: string; kinds?: Array<BusinessOption["kind"]> };

export const NAV: NavItem[] = [
  { href: "/console", label: "Live", icon: Radio, shortcut: "l" },
  { href: "/console/escalations", label: "Escalations", icon: LifeBuoy, shortcut: "e" },
  { href: "/console/customers", label: "Customers", icon: Users, shortcut: "c" },
  { href: "/console/orders", label: "Orders", icon: Package, shortcut: "o", kinds: ["store"] },
  { href: "/console/bookings", label: "Bookings", icon: CalendarCheck2, shortcut: "b" },
  { href: "/console/tickets", label: "Tickets", icon: Ticket, shortcut: "t" },
  { href: "/console/leads", label: "Leads", icon: Target, shortcut: "p" },
  { href: "/console/follow-ups", label: "Follow ups", icon: BellRing, shortcut: "f" },
  { href: "/console/analytics", label: "Analytics", icon: BarChart3, shortcut: "a" },
];

export function navFor(kind: BusinessOption["kind"] | undefined): NavItem[] {
  return NAV.filter((item) => !item.kinds || (kind !== undefined && item.kinds.includes(kind)));
}

export function isActive(pathname: string, href: string): boolean {
  return href === "/console" ? pathname === "/console" : pathname.startsWith(href);
}
