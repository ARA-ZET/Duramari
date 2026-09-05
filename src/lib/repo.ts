import { normalizeArchive, type YearArchive } from "./archive";
import {
  diffShards,
  fingerprintOf,
  fromShards,
  isEmptyShard,
  strip,
  toShards,
  type CoreShard,
  type MonthShard,
  type ShardFingerprint,
} from "./shards";
import type { BudgetData } from "./types";

/**
 * Storage backends
 * -----------------
 * `localRepo` is the only backend left here: it is the offline / no-Firebase
 * fallback (see `.env.local.example`). Signed-in users are stored on Google
 * Drive instead — see `googleDrive.ts` — so their budget data never touches
 * a database you pay to read or write. Firebase itself is kept only for
 * sign-in and the small profile document in `userProfile.ts`.
 *
 * Local layout (mirrors the Drive layout so the two stay easy to compare):
 *   <root>:core         settings + accounts + debtors  (small, always hot)
 *   <root>:month:{key}  one entry per budget period: income, overrides,
 *                       that period's transactions, USD entries and list
 *   <root>:archive:{y}  one entry per closed year, rolled up
 */

export interface SnapshotMeta {
  fromCache: boolean;
  hasPendingWrites: boolean;
}

export interface Repo {
  load(): Promise<BudgetData | null>;
  save(data: BudgetData): Promise<void>;
  loadArchives(): Promise<YearArchive[]>;
  saveArchive(archive: YearArchive): Promise<void>;
  subscribe?(cb: (data: BudgetData | null, meta?: SnapshotMeta) => void): () => void;
}

export function localRepo(uid: string): Repo {
  const root = `arazet-budget:${uid}`;
  const coreKey = `${root}:core`;
  const monthKey = (k: string) => `${root}:month:${k}`;
  const archiveKey = (y: number) => `${root}:archive:${y}`;
  const indexKey = `${root}:index`;
  const legacyKey = root;

  const readIndex = (): { months: string[]; archives: number[] } => {
    try {
      const raw = window.localStorage.getItem(indexKey);
      const v = raw ? JSON.parse(raw) : null;
      return { months: v?.months ?? [], archives: v?.archives ?? [] };
    } catch {
      return { months: [], archives: [] };
    }
  };
  const writeIndex = (months: string[], archives: number[]) =>
    window.localStorage.setItem(indexKey, JSON.stringify({ months, archives }));

  let fingerprint: ShardFingerprint | null = null;

  return {
    async load() {
      if (typeof window === "undefined") return null;
      try {
        const rawCore = window.localStorage.getItem(coreKey);
        if (!rawCore) {
          // migrate the old single blob, if there is one
          const legacy = window.localStorage.getItem(legacyKey);
          if (!legacy) return null;
          return JSON.parse(legacy) as BudgetData;
        }
        const core = JSON.parse(rawCore) as CoreShard;
        const shards: MonthShard[] = [];
        for (const k of readIndex().months) {
          const raw = window.localStorage.getItem(monthKey(k));
          if (raw) shards.push(JSON.parse(raw) as MonthShard);
        }
        const assembled = fromShards(core, shards);
        // Without a baseline the first save cannot tell which months were
        // removed, so a year-end clear would leave the old documents behind.
        fingerprint = fingerprintOf(assembled);
        return assembled;
      } catch {
        return null;
      }
    },

    async save(data) {
      if (typeof window === "undefined") return;
      const shards = toShards(data);
      const d = diffShards(shards, fingerprint);

      if (d.coreChanged) window.localStorage.setItem(coreKey, JSON.stringify(strip(shards.core)));
      for (const k of d.changed) {
        const s = shards.months[k];
        if (isEmptyShard(s)) window.localStorage.removeItem(monthKey(k));
        else window.localStorage.setItem(monthKey(k), JSON.stringify(strip(s)));
      }
      for (const k of d.removed) window.localStorage.removeItem(monthKey(k));

      const kept = Object.keys(shards.months).filter((k) => !isEmptyShard(shards.months[k]));
      writeIndex(kept, readIndex().archives);
      window.localStorage.removeItem(legacyKey);
      fingerprint = d.fingerprint;
    },

    async loadArchives() {
      if (typeof window === "undefined") return [];
      const out: YearArchive[] = [];
      for (const y of readIndex().archives) {
        try {
          const raw = window.localStorage.getItem(archiveKey(y));
          const a = raw ? normalizeArchive(JSON.parse(raw)) : null;
          if (a) out.push(a);
        } catch {
          /* a bad archive should not break the rest */
        }
      }
      return out.sort((a, b) => a.year - b.year);
    },

    async saveArchive(archive) {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(archiveKey(archive.year), JSON.stringify(strip(archive)));
      const idx = readIndex();
      writeIndex(idx.months, [...new Set([...idx.archives, archive.year])].sort());
    },
  };
}

/**
 * Storage that isn't. Backs the signed-out tour: edits behave normally for as
 * long as the tab is open, and vanish with it. Deliberately not localStorage —
 * sample data must never outlive the visit, be mistaken for real data, or need
 * cleaning up after someone signs in.
 */
export function memoryRepo(seed: BudgetData | (() => Promise<BudgetData>)): Repo {
  let held: BudgetData | null = typeof seed === "function" ? null : seed;
  const build = typeof seed === "function" ? seed : null;
  return {
    async load() {
      // Lazy so the tour can fetch its figures once, on the load the data
      // provider already awaits, instead of blocking the repo being created.
      if (!held && build) held = await build();
      return held;
    },
    async save(data) {
      held = data;
    },
    async loadArchives() {
      return [];
    },
    async saveArchive() {
      /* the tour has no history to keep */
    },
  };
}
