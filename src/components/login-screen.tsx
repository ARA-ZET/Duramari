"use client";

import { useState } from "react";
import Image from "next/image";
import { useAuth } from "./providers";
import { Button } from "./ui";
import { driveConfigured, firebaseConfigured } from "@/lib/firebase";
import { HardDriveDownload } from "lucide-react";

export function LoginScreen() {
  const { signInGoogle } = useAuth();
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
        <Image
          src="/icon-512.png"
          alt=""
          width={64}
          height={64}
          className="mx-auto mb-4 rounded-2xl shadow-card"
          priority
        />
        <h1 className="text-2xl font-extrabold">Duramari</h1>
        <p className="mt-1 text-sm muted">Your family&apos;s money, split into budgets that roll over month to month.</p>
      </div>

      <div className="card space-y-3">
        <Button onClick={run} disabled={busy} className="w-full">
          Continue with Google
        </Button>

        {err ? <p className="text-sm text-rose-500">{err}</p> : null}

        {driveConfigured ? (
          <p className="flex items-start gap-2 pt-1 text-xs muted">
            <HardDriveDownload size={15} className="mt-0.5 shrink-0" />
            <span>
              Your budget is stored in a private, hidden folder in your own Google Drive — not on our
              servers. Only this app can read it.
            </span>
          </p>
        ) : firebaseConfigured ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Drive storage isn&apos;t configured for this deployment (missing
            <code className="mx-1 rounded bg-black/5 px-1 py-0.5">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>). Sign-in
            will work, but budget data has nowhere reliable to be saved. See <code>.env.local.example</code>.
          </p>
        ) : null}
      </div>

      <p className="mt-6 text-center text-xs muted">
        Tip: leave Firebase keys empty in <code>.env.local</code> to try the app in local mode with no sign-in.
      </p>
    </div>
  );
}
