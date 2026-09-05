import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True when the Firebase web config has been provided via env vars. */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

/**
 * The OAuth 2.0 Web client id Firebase auto-created for Google sign-in on
 * this project (Google Cloud Console -> APIs & Services -> Credentials ->
 * "Web client (auto created by Google Service)"). Google Drive access needs
 * to silently refresh in the background — see googleDrive.ts — and that only
 * works when it reuses this exact client id, not a new one of its own.
 */
export const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/** True when signed-in users can actually get Google Drive storage. */
export const driveConfigured = firebaseConfigured && Boolean(googleClientId);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

if (firebaseConfigured) {
  app = getApps().length ? getApp() : initializeApp(config as Record<string, string>);
  // Not getAuth(): its default fallback chain ends in browserSessionPersistence,
  // so on a browser where both IndexedDB and localStorage are unavailable it
  // quietly becomes session-scoped and the user is signed out again the next
  // time the app is launched. iOS home-screen web apps are the case that bites.
  // Listing only the durable stores means a sign-in either survives a relaunch
  // or fails loudly at sign-in time, instead of looking fine and lapsing later.
  // Only in the browser: these persistences touch IndexedDB/localStorage, so
  // initializeAuth throws during Next's prerender. Nothing server-side reads
  // auth — every consumer is a "use client" component.
  authInstance =
    typeof window === "undefined"
      ? null
      : initializeAuth(app, {
          persistence: [indexedDBLocalPersistence, browserLocalPersistence],
          popupRedirectResolver: browserPopupRedirectResolver,
        });
  dbInstance = getFirestore(app);
}

export const firebaseApp = app;
export const auth = authInstance;
export const db = dbInstance;
