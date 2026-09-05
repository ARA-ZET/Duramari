# Duramari

*Duramari* — Shona for "grain store": what a family sets aside now for later. A
mobile-first family budgeting app built with **Next.js (App Router)**,
**TypeScript** and **Tailwind CSS**, ready to deploy on **Firebase App Hosting**.

- Income → **buckets** (Savings, Family & Friends, Rent/Food/Household, Business), with a **per-period editable split**.
- **Pay-date aware budget periods** — set the day you're paid and every month runs pay day to pay day, not the 1st to month end.
- **Per-bucket rollover** — each bucket's unspent balance carries into the next period ("balance c/f").
- Transaction types: **Expense**, **Income** (top-up), **Transfer** (move between your own accounts, e.g. buying USD — not counted as spending).
- **Rand savings accounts** + one or more **USD accounts** with an editable USD→ZAR rate.
- A **shopping list** per period, with running totals and one tap to log the shop against a bucket.
- **Reports** — savings trajectory, budget vs. actual, spending composition, savings rate, and computed insights — reading from both the live year and rolled-up archives of past years.
- **Debtors** (money owed to you), opening balances, and an **archive-then-roll-over** new year.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. **With no Firebase keys set, the app runs in local mode** (data saved in your browser only) so you can develop immediately — no sign-in required.

## How storage works

Signed-in users are **not** stored in a database you pay to read or write. After
signing in with Google, a user's whole budget — settings, transactions, months,
archives, shopping lists — lives in a hidden, app-only folder in **their own
Google Drive** (Drive's `appDataFolder`): invisible in their normal Drive UI,
readable only by this app, counted against their storage quota rather than
yours, and free to read and write against (unlike Firestore, which bills per
document). Firebase is used only for sign-in and one small profile document per
user (name, email, last sign-in) — see `src/lib/userProfile.ts`.

Two consequences worth knowing:

- **Google-only sign-in.** Drive access can only be granted through Google
  OAuth, so there's no email/password option — the two are joined by design.
- **No realtime push across devices.** Drive has no free equivalent to
  Firestore's `onSnapshot`. `driveRepo` polls every couple of minutes and
  whenever a tab regains focus (see `subscribe` in `src/lib/googleDrive.ts`),
  which is close enough for a budget app but not instant.

Local mode (no Firebase configured) is unaffected — it's the offline/dev
fallback and always uses `localStorage`.

## Connect Firebase + Google Drive

1. In the [Firebase console](https://console.firebase.google.com/), create a project (or use an existing one).
2. **Build → Authentication → Get started**, and enable the **Google** sign-in method.
3. **Build → Firestore Database → Create database** (start in production mode) — this only ever holds the tiny per-user profile doc.
4. **Project settings → General → Your apps → Web app** (`</>`), register an app, and copy the config values.
5. Copy `.env.local.example` to `.env.local` and paste the six `NEXT_PUBLIC_FIREBASE_*` values:

   ```bash
   cp .env.local.example .env.local
   ```

6. Follow the **Google Drive storage** section inside `.env.local.example` — it
   walks through enabling the Drive API, finding the OAuth client id Firebase
   already created for Google sign-in, and adding the `drive.appdata` scope to
   the OAuth consent screen. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` from that.
7. Restart `npm run dev`.

Without step 6, Google sign-in still works, but there is nowhere reliable for
budget data to be saved — the login screen shows a warning in that case.

### Firestore security rules

Deploy the included rules so each user can only read/write their own profile document:

```bash
npm i -g firebase-tools   # if you don't have it
firebase login
firebase use --add        # pick your project
firebase deploy --only firestore:rules
```

## Deploy to Firebase App Hosting

1. In the Firebase console: **Build → App Hosting → Get started**, and connect this repo (push it to GitHub first).
2. Put the same `NEXT_PUBLIC_FIREBASE_*` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` values into **`apphosting.yaml`** (they are public client keys, safe to commit), or set them as App Hosting environment variables.
3. Add your deployed URL to the OAuth client's **Authorized JavaScript origins** in Google Cloud Console (see `.env.local.example`), or sign-in will fail there.
4. Every push to your connected branch builds and deploys automatically.

Docs: https://firebase.google.com/docs/app-hosting

## Project structure

```
src/
  app/                 # routes: dashboard (/), months, shopping, accounts, reports, settings
  components/          # providers (auth + data), app shell, UI kit, sheets, charts
  lib/
    types.ts           # domain types
    defaults.ts        # default buckets, categories, accounts; normalize()/migration
    budget.ts           # calculations: rollover, account balances, formatting
    period.ts           # pay-date budget periods (period boundaries, labels)
    mutations.ts        # pure state updates
    archive.ts           # roll a closed year up into one small document
    reports.ts           # multi-year series + computed insights
    firebase.ts          # Firebase init (no-op until env is set)
    shards.ts            # split/reassemble a budget into its document shards
    repo.ts               # localStorage backend (offline / no-Firebase fallback)
    googleDrive.ts         # Google Drive backend: token refresh + REST + Repo
    userProfile.ts          # the one Firestore write: name/email, not budget data
apphosting.yaml        # Firebase App Hosting config
firestore.rules        # rules for the per-user profile document
```

## Notes & next ideas

- The rollover / account / period math lives in `src/lib/budget.ts`, `period.ts` and `archive.ts` and is pure — easy to unit test.
- Add CSV import from bank statements, recurring bills, or a household model (more than one person on the same budget).
- Drive's silent token refresh relies on third-party-cookie-friendly browser settings; strict privacy modes (Safari ITP, Brave) may fall back to the "Reconnect Google Drive" prompt more often than Chrome/Firefox.
