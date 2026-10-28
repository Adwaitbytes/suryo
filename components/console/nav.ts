import { BarChart3, BellRing, CalendarCheck2, LifeBuoy, Radio, Target, Ticket, Users, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; shortcut: string };

export const NAV: NavItem[] = [
  { href: "/console", label: "Live", icon: Radio, shortcut: "l" },
  { href: "/console/escalations", label: "Escalations", icon: LifeBuoy, shortcut: "e" },
  { href: "/console/customers", label: "Customers", icon: Users, shortcut: "c" },
  { href: "/console/bookings", label: "Bookings", icon: CalendarCheck2, shortcut: "b" },
  { href: "/console/tickets", label: "Tickets", icon: Ticket, shortcut: "t" },
  { href: "/console/leads", label: "Leads", icon: Target, shortcut: "p" },
  { href: "/console/follow-ups", label: "Follow ups", icon: BellRing, shortcut: "f" },
  { href: "/console/analytics", label: "Analytics", icon: BarChart3, shortcut: "a" },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/console" ? pathname === "/console" : pathname.startsWith(href);
}
