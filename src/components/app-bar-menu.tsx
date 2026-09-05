"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Menu, X } from "lucide-react";
import { MENU_NAV, isActive } from "./nav-items";

/**
 * The phone's overflow menu, holding the pages that no longer fit the tab bar.
 * Only rendered below `md` — the sidebar already lists everything above that.
 */
export function AppBarMenu() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  // Route changed underneath us (back button, a link elsewhere): the panel
  // should not be left hanging open over the new page.
  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-haspopup="menu"
        className="-mr-1 grid h-8 w-8 place-items-center rounded-lg"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {open ? (
        <>
          {/* Catches the tap that dismisses the panel. Sits under it, over
              everything else, so a tap anywhere outside closes rather than
              acting on whatever it landed on. */}
          <div
            className="fixed inset-0 z-40 bg-black/20 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="menu"
            className="absolute right-2 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border py-1 shadow-card md:hidden"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            {MENU_NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(path, href);
              return (
                <Link
                  key={href}
                  href={href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2.5 text-sm font-semibold",
                    active ? "text-brand-500" : undefined,
                  )}
                >
                  <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                  {label}
                </Link>
              );
            })}
          </div>
        </>
      ) : null}
    </>
  );
}
