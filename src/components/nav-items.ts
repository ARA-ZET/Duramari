import {
  LayoutDashboard,
  CalendarRange,
  Wallet,
  ShoppingCart,
  BarChart3,
  PiggyBank,
  Settings,
} from "lucide-react";

/**
 * What the phone's tab bar carries. Seven tabs across a phone leaves each one
 * too narrow to hit and too cramped to label; these are the five reached
 * day to day.
 */
export const PRIMARY_NAV = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/budget", label: "Budget", icon: PiggyBank },
  { href: "/months", label: "Months", icon: CalendarRange },
  { href: "/shopping", label: "Shopping", icon: ShoppingCart },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

/** Reached from the app bar menu on a phone. Savings is also where the
 *  figures kept off the home screen live. */
export const MENU_NAV = [
  { href: "/accounts", label: "Savings", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Everything, in order — the desktop sidebar has room for all of it. */
export const NAV_ITEMS = [...PRIMARY_NAV, ...MENU_NAV];

export function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}
