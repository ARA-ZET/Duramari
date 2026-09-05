import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

/**
 * The only Firestore write in the app: a small per-user profile document,
 * not the budget itself. One write per sign-in (see `providers.tsx`), not
 * one per edit — the budget data lives on the user's own Google Drive.
 */
export async function syncUserProfile(u: {
  uid: string;
  displayName: string | null;
  email: string | null;
}): Promise<void> {
  if (!db) return;
  await setDoc(
    doc(db, "users", u.uid),
    {
      displayName: u.displayName,
      email: u.email,
      storage: "drive",
      lastSignInAt: serverTimestamp(),
    },
    { merge: true },
  );
}
