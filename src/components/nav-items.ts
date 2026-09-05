import {
  LayoutDashboard,
  CalendarRange,
  Wallet,
  ShoppingCart,
  BarChart3,
  PiggyBank,
  Settings,
} from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/budget", label: "Budget", icon: PiggyBank },
  { href: "/months", label: "Months", icon: CalendarRange },
  { href: "/shopping", label: "Shopping", icon: ShoppingCart },
  { href: "/accounts", label: "Savings", icon: Wallet },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}
