"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { PRIMARY_NAV, isActive } from "./nav-items";

/** Mobile-only tab bar. Replaced by the sidebar from `md` up. */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t safe-bottom md:hidden"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {PRIMARY_NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition",
                active ? "text-brand-500" : "muted",
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
