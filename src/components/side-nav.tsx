"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { AlertTriangle, HardDrive, Loader2 } from "lucide-react";
import { NAV_ITEMS, isActive } from "./nav-items";
import type { AuthMode } from "./providers";

/** Desktop/tablet sidebar. Hidden below `md`, where BottomNav takes over. */
export function SideNav({
  mode,
  saving,
  error,
  driveReauthNeeded,
}: {
  mode: AuthMode;
  saving: boolean;
  error?: string | null;
  driveReauthNeeded?: boolean;
}) {
  const path = usePathname();
  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r px-3 py-5 md:flex lg:w-64"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="mb-6 flex items-center gap-2 px-2">
        <Image src="/icon-192.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />
        <span className="text-base font-extrabold">Duramari</span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                active ? "bg-brand-500 text-white" : "muted hover:bg-black/5",
              )}
            >
              <Icon size={19} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div
        className={clsx(
          "mt-auto flex items-center gap-1.5 px-3 text-xs",
          driveReauthNeeded || error ? "font-semibold" : "muted",
          driveReauthNeeded ? "text-amber-600" : error ? "text-rose-500" : undefined,
        )}
        title={error ?? (driveReauthNeeded ? "Reconnect Google Drive" : undefined)}
      >
        {driveReauthNeeded ? (
          <>
            <AlertTriangle size={15} /> Reconnect Drive
          </>
        ) : error ? (
          <>
            <AlertTriangle size={15} /> Not saved
          </>
        ) : mode === "local" ? (
          <>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <HardDrive size={15} />}
            {saving ? "Saving…" : "Local only"}
          </>
        ) : (
          <>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <HardDrive size={15} />}
            {saving ? "Saving…" : "Google Drive"}
          </>
        )}
      </div>
    </aside>
  );
}
