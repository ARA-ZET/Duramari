"use client";

import { useState } from "react";
import Image from "next/image";
import { useAuth } from "./providers";
import { Button } from "./ui";
import { driveConfigured } from "@/lib/firebase";
import { HardDriveDownload } from "lucide-react";

export function LoginScreen() {
  const { signInGoogle, startDemo } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      await signInGoogle();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <div className="mb-8 text-center">
        {/* The full logo already says the name and the tagline, so the heading
            below is there for screen readers only. */}
        <div className="mx-auto mb-5 h-40 w-40 overflow-hidden rounded-3xl shadow-card">
          <Image
            src="/logo.png"
            alt=""
            width={512}
            height={512}
            className="h-full w-full scale-[1.18] object-cover"
            priority
          />
        </div>
        <h1 className="sr-only">Duramari — Plan, Budget, Grow</h1>
        <p className="text-sm muted">Your family&apos;s money, split into budgets that roll over month to month.</p>
      </div>

      <div className="card space-y-3">
        <Button onClick={run} disabled={busy} className="w-full">
          Continue with Google
        </Button>

        {err ? <p className="text-sm text-rose-500">{err}</p> : null}

        <Button variant="ghost" onClick={startDemo} disabled={busy} className="w-full">
          Take a look around first
        </Button>

        <p className="pt-1 text-center text-xs muted">
          The tour is filled with sample figures. Signing in starts you a fresh, empty budget.
        </p>

        {driveConfigured ? (
          <p className="flex items-start gap-2 border-t pt-3 text-xs muted" style={{ borderColor: "var(--border)" }}>
            <HardDriveDownload size={15} className="mt-0.5 shrink-0" />
            <span>
              Your budget is stored in a private, hidden folder in your own Google Drive — not on our
              servers. Only this app can read it.
            </span>
          </p>
        ) : null}
      </div>

    </div>
  );
}
