"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useAuth, useData } from "./providers";
import { BottomNav } from "./bottom-nav";
import { AppBarMenu } from "./app-bar-menu";
import { SideNav } from "./side-nav";
import { LoginScreen } from "./login-screen";
import { Button } from "./ui";
import { Loader2, HardDrive, AlertTriangle, RefreshCw, FlaskConical } from "lucide-react";

function Splash({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <Loader2 className="animate-spin text-brand-500" size={28} />
      <p className="text-sm muted">{label}</p>
    </div>
  );
}

/** Shown when Drive access has lapsed before the budget ever loaded — never
 *  a blank budget, which would look like the user's real (empty) data. */
function ReconnectDriveScreen() {
  const { reconnectDrive, driveReauthReason } = useData();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      await reconnectDrive();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reconnect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 text-center">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-amber-500 text-white shadow-card">
        <HardDrive size={30} />
      </div>
      <h1 className="text-xl font-extrabold">Reconnect Google Drive</h1>
      <p className="mt-2 text-sm muted">
        Your budget lives in your Google Drive, and access to it has expired. Reconnect to pick up
        where you left off — nothing has been lost.
      </p>
      {err ? <p className="mt-3 text-sm text-rose-500">{err}</p> : null}
      {driveReauthReason ? (
        <p className="mt-2 text-xs muted">
          Google said: <code>{driveReauthReason}</code>
        </p>
      ) : null}
      <Button onClick={run} disabled={busy} className="mx-auto mt-5">
        <RefreshCw size={16} className={busy ? "animate-spin" : undefined} />
        Reconnect
      </Button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, mode, demo, signInGoogle } = useAuth();
  const { ready, saving, error, driveReauthNeeded, reconnectDrive } = useData();

  if (loading) return <Splash label="Loading…" />;
  if (mode === "firebase" && !user && !demo) return <LoginScreen />;
  if (mode === "firebase" && !ready && driveReauthNeeded) return <ReconnectDriveScreen />;
  if (!ready) return <Splash label="Loading your budget…" />;

  return (
    <div className="min-h-screen md:pl-56 lg:pl-64">
      <SideNav mode={mode} saving={saving} error={error} driveReauthNeeded={driveReauthNeeded} />

      {/* Mobile top bar — the sidebar carries the brand and sync state from md up. */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 safe-top md:hidden"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <Image src="/icon-192.png" alt="" width={28} height={28} className="h-7 w-7 rounded-lg" />
          <span className="text-base font-extrabold">Duramari</span>
        </div>
        <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 text-xs muted">
          {driveReauthNeeded ? (
            <button
              onClick={() => void reconnectDrive()}
              className="flex items-center gap-1 font-semibold text-amber-600"
            >
              <AlertTriangle size={15} /> Reconnect Drive
            </button>
          ) : error ? (
            <span title={error} className="flex items-center gap-1 font-semibold text-rose-500">
              <AlertTriangle size={15} /> Not saved
            </span>
          ) : demo ? (
            <span className="flex items-center gap-1 font-semibold text-brand-500">
              <FlaskConical size={15} /> Sample
            </span>
          ) : mode === "local" ? (
            <span title="Local mode — data saved in this browser only" className="flex items-center gap-1">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <HardDrive size={15} />}
              {saving ? "Saving" : "Local"}
            </span>
          ) : (
            <span title={saving ? "Saving to Google Drive…" : "Saved to your Google Drive"} className="flex items-center gap-1">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <HardDrive size={15} />}
              {saving ? "Saving" : "Drive"}
            </span>
          )}
        </div>
        <AppBarMenu />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-3 pb-24 pt-1.5 md:max-w-3xl md:px-5 md:pb-10 md:pt-4 lg:max-w-5xl lg:px-6 xl:max-w-6xl">
        {demo ? (
          <div className="mb-3 mt-1 flex items-center justify-between gap-3 rounded-xl border border-brand-300 bg-brand-50 px-3 py-2 text-xs text-brand-900">
            <span>
              <b>You&apos;re looking at sample data.</b> Change anything you like — nothing is saved,
              and it all disappears when you leave. Sign in to start your own, empty budget.
            </span>
            <button onClick={() => void signInGoogle()} className="shrink-0 font-bold underline">
              Sign in
            </button>
          </div>
        ) : null}
        {driveReauthNeeded ? (
          <div className="mb-3 mt-1 flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span>
              Google Drive access expired — your last change is queued and will save as soon as you
              reconnect.
            </span>
            <button onClick={() => void reconnectDrive()} className="shrink-0 font-bold underline">
              Reconnect
            </button>
          </div>
        ) : error ? (
          <div className="mb-3 mt-1 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
            Your last change could not be saved: {error}
          </div>
        ) : null}
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
