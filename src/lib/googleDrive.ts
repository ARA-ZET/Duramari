import { normalizeArchive, type YearArchive } from "./archive";
import type { Repo, SnapshotMeta } from "./repo";
import {
  diffShards,
  fingerprintOf,
  fromShards,
  isEmptyShard,
  strip,
  toShards,
  type ShardFingerprint,
} from "./shards";
import type { BudgetData } from "./types";

/**
 * Google Drive as the budget store.
 * ----------------------------------
 * Every signed-in user's data lives in *their own* Drive, in the hidden
 * "app data" folder — invisible in their normal Drive UI, reachable only by
 * this app, and never seen by any other app or person. It still counts
 * against their own storage quota, but Drive API calls themselves are free
 * within Google's standard per-user quota, unlike Firestore reads/writes.
 * Firebase is kept only for sign-in and one small profile document
 * (see userProfile.ts) — no budget data ever reaches Firestore.
 *
 * File layout inside appDataFolder (mirrors the local/shard layout):
 *   core.json            settings + accounts + debtors
 *   month-{YYYY-MM}.json one file per budget period
 *   archive-{YYYY}.json  one file per closed year, rolled up
 */

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
/** Refresh this long before the token actually expires, to absorb clock drift. */
const REFRESH_MARGIN_MS = 2 * 60_000;
/** Firebase's sign-in popup doesn't tell us the token's real lifetime; Google's
 *  access tokens are typically valid ~3600s, so assume the conservative end. */
const ASSUMED_TOKEN_LIFETIME_S = 3300;
const GIS_SRC = "https://accounts.google.com/gsi/client";

export class DriveReauthRequiredError extends Error {
  /** Google's own reason, kept so a failure is diagnosable instead of generic. */
  readonly reason?: string;
  constructor(reason?: string) {
    super(
      reason
        ? `Google Drive access needs to be reconnected (${reason}).`
        : "Google Drive access needs to be reconnected.",
    );
    this.name = "DriveReauthRequiredError";
    this.reason = reason;
  }
}

/**
 * Where the short-lived Drive token is kept between page loads.
 *
 * sessionStorage, not localStorage: it survives reloads and in-tab navigation
 * — the case that was forcing a reconnect on every refresh — but is dropped
 * when the tab closes, so the token isn't left sitting at rest. It is scoped
 * to this app's own hidden Drive folder and expires within the hour either way.
 */
const TOKEN_STORAGE_KEY = "duramari:drive-token";

interface TokenState {
  token: string;
  expiresAt: number;
}

function readStoredToken(): TokenState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TokenState;
    if (typeof parsed?.token !== "string" || typeof parsed?.expiresAt !== "number") return null;
    // already dead — drop it rather than hand back something that will 401
    if (parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredToken(state: TokenState | null) {
  if (typeof window === "undefined") return;
  try {
    if (state) window.sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(state));
    else window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* private mode / quota — the in-memory copy still works for this page */
  }
}

// ---------------- Google Identity Services loader ----------------

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface GisTokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
}
interface GisOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    prompt?: string;
    callback: (resp: GisTokenResponse) => void;
    error_callback?: (err: { type?: string }) => void;
  }): GisTokenClient;
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GisOAuth2 } };
  }
}

let gisLoad: Promise<void> | null = null;

/** Load Google Identity Services once, however many callers ask for it. */
function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoad) return gisLoad;
  gisLoad = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Could not load Google Identity Services")), {
      once: true,
    });
    if (!existing) document.head.appendChild(script);
  });
  return gisLoad;
}

// ---------------- token manager ----------------

export interface DriveAuth {
  /** A usable access token, refreshing silently first if the cached one is stale. */
  getToken(): Promise<string>;
  /** Seed the manager with the token Firebase's sign-in popup already obtained. */
  seed(accessToken: string, approxExpiresInSeconds?: number): void;
  /** Interactive re-consent — only call this from a click handler. */
  reconnect(): Promise<string>;
  /** True once we hold a token we believe is still valid. */
  isConnected(): boolean;
  clear(): void;
}

/**
 * `clientId` must be the SAME OAuth client Firebase's Google sign-in uses
 * (Google Cloud Console -> APIs & Services -> Credentials -> the auto-created
 * "Web client" for this Firebase project), or a silent refresh looks like a
 * different app and Google will refuse to skip the consent screen.
 */
export function createDriveAuth(clientId: string): DriveAuth {
  // Seeded from the last page load, so a refresh reuses a token that is still
  // good instead of going back to Google for one.
  let state: TokenState | null = readStoredToken();
  let refreshing: Promise<string> | null = null;
  let renewTimer: ReturnType<typeof setTimeout> | null = null;

  function isFresh(marginMs: number): boolean {
    return !!state && state.expiresAt - Date.now() > marginMs;
  }

  function setState(next: TokenState | null) {
    state = next;
    writeStoredToken(next);
    scheduleRenew();
  }

  /**
   * Renew a few minutes before expiry while the app is open, so a tab left
   * open past the hour keeps working instead of failing on the next save.
   */
  function scheduleRenew() {
    if (renewTimer) clearTimeout(renewTimer);
    renewTimer = null;
    if (!state || typeof window === "undefined") return;
    const delay = Math.max(state.expiresAt - Date.now() - REFRESH_MARGIN_MS, 30_000);
    renewTimer = setTimeout(() => {
      // best effort: if it fails, the next real call surfaces it properly
      void requestToken("").catch(() => {});
    }, delay);
  }

  function requestToken(prompt: string): Promise<string> {
    return loadGis().then(
      () =>
        new Promise<string>((resolve, reject) => {
          const oauth2 = window.google?.accounts?.oauth2;
          if (!oauth2) {
            reject(new DriveReauthRequiredError());
            return;
          }
          const client = oauth2.initTokenClient({
            client_id: clientId,
            scope: GOOGLE_DRIVE_SCOPE,
            callback: (resp) => {
              if (!resp.access_token) {
                reject(new DriveReauthRequiredError(resp.error));
                return;
              }
              setState({
                token: resp.access_token,
                expiresAt: Date.now() + (resp.expires_in ?? ASSUMED_TOKEN_LIFETIME_S) * 1000,
              });
              resolve(resp.access_token);
            },
            error_callback: (err) => reject(new DriveReauthRequiredError(err?.type)),
          });
          client.requestAccessToken({ prompt });
        }),
    );
  }

  return {
    seed(accessToken, approxExpiresInSeconds = ASSUMED_TOKEN_LIFETIME_S) {
      setState({ token: accessToken, expiresAt: Date.now() + approxExpiresInSeconds * 1000 });
    },
    async getToken() {
      if (isFresh(REFRESH_MARGIN_MS)) return state!.token;
      if (!refreshing) {
        // prompt: "" asks for a token with no UI, using the existing consent —
        // this is what makes refresh silent instead of interrupting the user
        refreshing = requestToken("").finally(() => {
          refreshing = null;
        });
      }
      return refreshing;
    },
    async reconnect() {
      return requestToken("consent");
    },
    isConnected() {
      return isFresh(0);
    },
    clear() {
      if (renewTimer) clearTimeout(renewTimer);
      renewTimer = null;
      state = null;
      writeStoredToken(null);
    },
  };
}

// ---------------- Drive REST calls ----------------

async function driveFetch(auth: DriveAuth, url: string, init: RequestInit, allowRetry = true): Promise<Response> {
  const token = await auth.getToken();
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && allowRetry) {
    auth.clear();
    return driveFetch(auth, url, init, false);
  }
  return res;
}

const BOUNDARY = "arazet_budget_boundary";

/** Drive's create endpoint wants `multipart/related`, which `FormData` can't produce. */
export function buildMultipartBody(
  metadata: Record<string, unknown>,
  content: string,
): { body: string; contentType: string } {
  const body =
    `--${BOUNDARY}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${BOUNDARY}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${content}\r\n` +
    `--${BOUNDARY}--`;
  return { body, contentType: `multipart/related; boundary=${BOUNDARY}` };
}

/** How often a background tab polls Drive for changes made elsewhere. */
const POLL_MS = 90_000;

export function driveRepo(auth: DriveAuth): Repo {
  let index: Map<string, string> | null = null; // file name -> Drive file id
  let indexPromise: Promise<Map<string, string>> | null = null;
  let fingerprint: ShardFingerprint | null = null;
  // Serialises writes so two shards can never race to create the same new
  // file — Promise.all-ing independent creates is fine, overlapping save()
  // calls (e.g. a debounce flush racing a pagehide flush) is not.
  let saveChain: Promise<void> = Promise.resolve();

  function resetIndex() {
    index = null;
    indexPromise = null;
  }

  async function ensureIndex(): Promise<Map<string, string>> {
    if (index) return index;
    if (!indexPromise) {
      indexPromise = (async () => {
        const res = await driveFetch(
          auth,
          `${DRIVE_FILES}?spaces=appDataFolder&fields=files(id,name)&pageSize=1000`,
          { method: "GET" },
        );
        if (!res.ok) throw new Error(`Could not list Drive files (${res.status})`);
        const data = (await res.json()) as { files?: { id: string; name: string }[] };
        const built = new Map((data.files ?? []).map((f) => [f.name, f.id] as const));
        index = built;
        return built;
      })();
    }
    return indexPromise;
  }

  async function readFile<T>(name: string): Promise<T | null> {
    const idx = await ensureIndex();
    const id = idx.get(name);
    if (!id) return null;
    const res = await driveFetch(auth, `${DRIVE_FILES}/${id}?alt=media`, { method: "GET" });
    if (res.status === 404) {
      idx.delete(name);
      return null;
    }
    if (!res.ok) throw new Error(`Could not read ${name} from Drive (${res.status})`);
    return (await res.json()) as T;
  }

  async function writeFile(name: string, content: unknown): Promise<void> {
    const idx = await ensureIndex();
    const id = idx.get(name);
    const body = JSON.stringify(content);
    if (id) {
      const res = await driveFetch(auth, `${DRIVE_UPLOAD}/${id}?uploadType=media`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) throw new Error(`Could not save ${name} to Drive (${res.status})`);
      return;
    }
    const { body: multipart, contentType } = buildMultipartBody({ name, parents: ["appDataFolder"] }, body);
    const res = await driveFetch(auth, `${DRIVE_UPLOAD}?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: multipart,
    });
    if (!res.ok) throw new Error(`Could not create ${name} on Drive (${res.status})`);
    const created = (await res.json()) as { id: string };
    idx.set(name, created.id);
  }

  async function deleteFile(name: string): Promise<void> {
    const idx = await ensureIndex();
    const id = idx.get(name);
    if (!id) return;
    const res = await driveFetch(auth, `${DRIVE_FILES}/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`Could not delete ${name} on Drive (${res.status})`);
    idx.delete(name);
  }

  /** Re-list and re-read everything — used by both `load()` and the poller. */
  async function assembleFresh(): Promise<BudgetData | null> {
    resetIndex();
    const core = await readFile<import("./shards").CoreShard>("core.json");
    if (!core) return null;
    const idx = await ensureIndex();
    const monthNames = [...idx.keys()].filter((n) => n.startsWith("month-"));
    const shards = (
      await Promise.all(monthNames.map((n) => readFile<import("./shards").MonthShard>(n)))
    ).filter((s): s is import("./shards").MonthShard => s !== null);
    return fromShards(core, shards);
  }

  async function doSave(data: BudgetData): Promise<void> {
    const shards = toShards(data);
    const d = diffShards(shards, fingerprint);
    if (!d.coreChanged && !d.changed.length && !d.removed.length) return;

    const ops: Promise<void>[] = [];
    if (d.coreChanged) ops.push(writeFile("core.json", strip(shards.core)));
    for (const k of d.changed) {
      const s = shards.months[k];
      ops.push(isEmptyShard(s) ? deleteFile(`month-${k}.json`) : writeFile(`month-${k}.json`, strip(s)));
    }
    for (const k of d.removed) ops.push(deleteFile(`month-${k}.json`));
    await Promise.all(ops);
    fingerprint = d.fingerprint;
  }

  return {
    async load() {
      const assembled = await assembleFresh();
      if (assembled) fingerprint = fingerprintOf(assembled);
      return assembled;
    },

    save(data) {
      const run = saveChain.then(() => doSave(data));
      // keep the queue alive even if this save failed, so the next one still runs
      saveChain = run.catch(() => {});
      return run;
    },

    async loadArchives() {
      const idx = await ensureIndex();
      const names = [...idx.keys()].filter((n) => n.startsWith("archive-"));
      const raw = await Promise.all(names.map((n) => readFile<unknown>(n)));
      return raw
        .map((a) => normalizeArchive(a))
        .filter((a): a is YearArchive => a !== null)
        .sort((a, b) => a.year - b.year);
    },

    async saveArchive(archive) {
      await writeFile(`archive-${archive.year}.json`, strip(archive));
    },

    /**
     * Drive has no free realtime push, so other tabs/devices are picked up by
     * polling instead: every couple of minutes, and immediately whenever the
     * tab regains focus. `DataProvider` already knows how to ignore a remote
     * snapshot while a local edit is unsaved, so this can reuse that as-is.
     */
    subscribe(cb: (data: BudgetData | null, meta?: SnapshotMeta) => void) {
      let stopped = false;
      const check = async () => {
        if (stopped) return;
        try {
          const assembled = await assembleFresh();
          if (!assembled) return;
          const fp = fingerprintOf(assembled);
          if (JSON.stringify(fp) !== JSON.stringify(fingerprint)) {
            fingerprint = fp;
            cb(assembled, { fromCache: false, hasPendingWrites: false });
          }
        } catch (e) {
          console.error("Drive poll failed", e);
        }
      };
      const interval = setInterval(() => void check(), POLL_MS);
      const onVisible = () => {
        if (document.visibilityState === "visible") void check();
      };
      document.addEventListener("visibilitychange", onVisible);
      return () => {
        stopped = true;
        clearInterval(interval);
        document.removeEventListener("visibilitychange", onVisible);
      };
    },
  };
}
