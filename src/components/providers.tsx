"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, driveConfigured, firebaseConfigured, googleClientId } from "@/lib/firebase";
import { localRepo, memoryRepo, type Repo } from "@/lib/repo";
import {
  createDriveAuth,
  driveRepo,
  DriveReauthRequiredError,
  GOOGLE_DRIVE_SCOPE,
  type DriveAuth,
} from "@/lib/googleDrive";
import { syncUserProfile } from "@/lib/userProfile";
import { defaultData, needsRepair, normalize } from "@/lib/defaults";
import { buildDemoData } from "@/lib/demoData";
import { buildYearArchive, type YearArchive } from "@/lib/archive";
import { startNewYear } from "@/lib/mutations";
import { accountBalances, usdAccountBalance } from "@/lib/budget";
import type { BudgetData } from "@/lib/types";

export type AuthMode = "firebase" | "local";

export interface AppUser {
  uid: string;
  displayName: string | null;
  email: string | null;
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  mode: AuthMode;
  /** Non-null once Drive storage is available to sign in with — see driveConfigured. */
  driveAuth: DriveAuth | null;
  /** Looking around with sample data, without an account. */
  demo: boolean;
  startDemo: () => void;
  signInGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const LOCAL_USER: AppUser = { uid: "local", displayName: "Local", email: null };

const DEMO_STORAGE_KEY = "duramari:demo";

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(firebaseConfigured ? null : LOCAL_USER);
  const [loading, setLoading] = useState(firebaseConfigured);
  // sessionStorage, not state alone: the tour has to survive a reload or a
  // link opened directly, or a visitor is thrown back to the sign-in screen
  // mid-look. Per-tab, so it still ends when the tab does.
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(DEMO_STORAGE_KEY) === "1") setDemo(true);
    } catch {
      /* private mode — the tour just won't survive a reload */
    }
  }, []);

  const setDemoMode = useCallback((on: boolean) => {
    setDemo(on);
    try {
      if (on) window.sessionStorage.setItem(DEMO_STORAGE_KEY, "1");
      else window.sessionStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      /* not fatal */
    }
  }, []);
  // One token manager for the whole session — it doesn't need a signed-in
  // user to exist, only the OAuth client id, so it's created up front and
  // seeded once sign-in actually happens.
  const driveAuthRef = useRef<DriveAuth | null>(driveConfigured ? createDriveAuth(googleClientId) : null);

  useEffect(() => {
    if (!firebaseConfigured || !auth) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ? { uid: u.uid, displayName: u.displayName, email: u.email } : null);
      setLoading(false);
      if (!u) driveAuthRef.current?.clear();
    });
    return () => unsub();
  }, []);

  const signInGoogle = useCallback(async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    if (driveConfigured) {
      provider.addScope(GOOGLE_DRIVE_SCOPE);
      // select_account, not consent: re-consenting on every sign-in is what
      // made this feel like signing in over and over. A user who actually
      // revoked Drive access is caught later by the reconnect screen, which
      // calls driveAuth.reconnect() and does force the consent prompt.
      provider.setCustomParameters({ prompt: "select_account" });
    }
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) driveAuthRef.current?.seed(credential.accessToken);
    // Drop the tour before the real budget loads. The sample only ever lived
    // in memory, so there is nothing to clean up and nothing to overwrite —
    // the new account starts from defaults, not from what was on screen.
    setDemoMode(false);
    await syncUserProfile({
      uid: result.user.uid,
      displayName: result.user.displayName,
      email: result.user.email,
    });
  }, [setDemoMode]);

  const signOutUser = useCallback(async () => {
    if (!auth) return;
    driveAuthRef.current?.clear();
    await signOut(auth);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    mode: firebaseConfigured ? "firebase" : "local",
    driveAuth: driveAuthRef.current,
    demo,
    startDemo: () => setDemoMode(true),
    signInGoogle,
    signOutUser,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within Providers");
  return ctx;
}

// ---------------- Data ----------------

interface DataContextValue {
  data: BudgetData | null;
  /** Closed years, rolled up. One cheap read each. */
  archives: YearArchive[];
  ready: boolean;
  saving: boolean;
  /** Last save failure, so the header can stop claiming "Synced". */
  error: string | null;
  /** Google's access grant lapsed and needs an interactive reconnect. */
  driveReauthNeeded: boolean;
  /** Google's own reason for the lapse, when it gave one. */
  driveReauthReason: string | null;
  /** Must be called from a click handler — it opens a Google consent popup. */
  reconnectDrive: () => Promise<void>;
  mutate: (updater: (prev: BudgetData) => BudgetData) => void;
  /** Roll the live year into an archive, then start the next one. */
  archiveAndStartYear: () => Promise<void>;
  reset: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

/** Writes are coalesced so holding a key in a number field is one save, not ten. */
const SAVE_DEBOUNCE_MS = 400;

function DataProvider({ children }: { children: React.ReactNode }) {
  const { user, mode, driveAuth, demo } = useAuth();
  const [data, setData] = useState<BudgetData | null>(null);
  const [archives, setArchives] = useState<YearArchive[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driveReauthNeeded, setDriveReauthNeeded] = useState(false);
  const [driveReauthReason, setDriveReauthReason] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const repoRef = useRef<Repo | null>(null);
  const dataRef = useRef<BudgetData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<BudgetData | null>(null);
  /** Snapshots echo back our own writes; ignore them until our write settles. */
  const inFlightRef = useRef(0);

  const flush = useCallback(async () => {
    const repo = repoRef.current;
    const next = pendingRef.current;
    pendingRef.current = null;
    timerRef.current = null;
    if (!repo || !next) return;
    inFlightRef.current += 1;
    setSaving(true);
    try {
      await repo.save(next);
      setError(null);
      setDriveReauthNeeded(false);
      setDriveReauthReason(null);
    } catch (e) {
      console.error("save failed", e);
      if (e instanceof DriveReauthRequiredError) {
        // Keep the edit queued — flush() will run again once reconnected —
        // rather than reporting it as lost.
        pendingRef.current = next;
        setDriveReauthNeeded(true);
        setDriveReauthReason(e.reason ?? null);
      } else {
        setError(e instanceof Error ? e.message : "Could not save your changes");
      }
    } finally {
      inFlightRef.current -= 1;
      if (inFlightRef.current <= 0) {
        inFlightRef.current = 0;
        setSaving(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setData(null);
    setArchives([]);
    setError(null);
    setDriveReauthNeeded(false);
    setDriveReauthReason(null);
    repoRef.current = null;
    pendingRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!user && !demo) return;

    // The tour is served from memory so nothing about it can be persisted or
    // confused with a real budget; a signed-in user gets Drive when it is
    // available, and localStorage only in the no-Firebase fallback.
    const repo = demo
      ? memoryRepo(buildDemoData())
      : driveAuth
        ? driveRepo(driveAuth)
        : localRepo(user!.uid);
    repoRef.current = repo;

    (async () => {
      let loaded: BudgetData;
      try {
        const raw = await repo.load();
        if (raw) {
          // Repair anything an older version of the app (or a partial write) left behind.
          loaded = normalize(raw);
          if (needsRepair(raw)) await repo.save(loaded);
        } else {
          loaded = defaultData();
          await repo.save(loaded);
        }
      } catch (e) {
        console.error("load failed", e);
        if (cancelled) return;
        if (e instanceof DriveReauthRequiredError) {
          // Do NOT fall back to a blank budget here — that would be shown as
          // "your data", and could even get saved over the real thing once
          // reconnected. Show the reconnect screen instead and stop.
          setDriveReauthNeeded(true);
          setDriveReauthReason(e.reason ?? null);
          return;
        }
        setError(e instanceof Error ? e.message : "Could not load your budget");
        loaded = defaultData();
      }
      if (cancelled) return;
      dataRef.current = loaded;
      setData(loaded);
      setReady(true);

      try {
        const past = await repo.loadArchives();
        if (!cancelled) setArchives(past);
      } catch (e) {
        console.error("loading archives failed", e);
      }
    })();

    let unsub: (() => void) | undefined;
    if (repo.subscribe) {
      unsub = repo.subscribe((remote, meta) => {
        if (cancelled || !remote) return;
        // Our own write coming back, or a change we have not finished sending —
        // adopting it would revert whatever the user typed in the meantime.
        if (meta?.fromCache || meta?.hasPendingWrites) return;
        if (inFlightRef.current > 0 || pendingRef.current) return;
        const fresh = normalize(remote);
        dataRef.current = fresh;
        setData(fresh);
        setReady(true);
      });
    }
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [user, mode, driveAuth, demo, reloadNonce]);

  // Never lose a debounced write to a tab close or navigation.
  useEffect(() => {
    const onHide = () => {
      if (pendingRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current);
        void flush();
      }
    };
    window.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [flush]);

  const mutate = useCallback(
    (updater: (prev: BudgetData) => BudgetData) => {
      setData((prev) => {
        if (!prev) return prev;
        let next: BudgetData;
        try {
          next = updater(prev);
        } catch (e) {
          console.error("mutation failed", e);
          setError(e instanceof Error ? e.message : "That change could not be applied");
          return prev;
        }
        if (next === prev) return prev;
        dataRef.current = next;
        pendingRef.current = next;
        setSaving(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [flush],
  );

  /**
   * Interactive re-consent for Google Drive. Must be called from a click —
   * it opens (or reuses) a Google popup, which browsers block outside a
   * user gesture. Once it succeeds, retry whatever was stuck: a queued
   * write, or — if reauth was needed before the budget ever loaded — the
   * initial load itself.
   */
  const reconnectDrive = useCallback(async () => {
    if (!driveAuth) return;
    await driveAuth.reconnect();
    setDriveReauthNeeded(false);
    setDriveReauthReason(null);
    if (pendingRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current);
      void flush();
    } else if (!ready) {
      setReloadNonce((n) => n + 1);
    }
  }, [driveAuth, flush, ready]);

  /**
   * Roll the closing year up into its own document before clearing it, so the
   * reports keep their history instead of resetting every January.
   */
  const archiveAndStartYear = useCallback(async () => {
    const repo = repoRef.current;
    const current = pendingRef.current ?? dataRef.current;
    if (!repo || !current) return;

    const archive = buildYearArchive(current);
    try {
      await repo.saveArchive(archive);
    } catch (e) {
      console.error("archiving failed", e);
      setError(e instanceof Error ? e.message : "Could not archive this year");
      return; // never clear the year if its archive did not land
    }
    setArchives((prev) => [...prev.filter((a) => a.year !== archive.year), archive].sort((a, b) => a.year - b.year));

    const closing: Record<string, number> = {};
    const usdClosing: Record<string, number> = {};
    for (const b of accountBalances(current)) {
      if (b.account.kind === "zar") closing[b.account.id] = b.balance;
      else usdClosing[b.account.id] = usdAccountBalance(current, b.account).usd;
    }
    mutate(startNewYear(archive.year + 1, closing, usdClosing));
  }, [mutate]);

  const reset = useCallback(() => {
    mutate(() => defaultData());
  }, [mutate]);

  const value = useMemo<DataContextValue>(
    () => ({
      data,
      archives,
      ready,
      saving,
      error,
      driveReauthNeeded,
      driveReauthReason,
      reconnectDrive,
      mutate,
      archiveAndStartYear,
      reset,
    }),
    [data, archives, ready, saving, error, driveReauthNeeded, driveReauthReason, reconnectDrive, mutate, archiveAndStartYear, reset],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within Providers");
  return ctx;
}

/**
 * Ask the browser to treat this app's storage as persistent, so it is not
 * evicted under storage pressure. That storage is where Firebase keeps the
 * signed-in session, so losing it means being asked to sign in again. Safari
 * grants this to home-screen web apps without prompting; other browsers
 * decide on their own heuristics. Best-effort — a refusal is not an error.
 */
function usePersistentStorage() {
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => {});
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  usePersistentStorage();
  return (
    <AuthProvider>
      <DataProvider>{children}</DataProvider>
    </AuthProvider>
  );
}
