import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
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
  authInstance = getAuth(app);
  dbInstance = getFirestore(app);
}

export const firebaseApp = app;
export const auth = authInstance;
export const db = dbInstance;
