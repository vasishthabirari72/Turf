"use client";

// Who is using the app, on this device.
//
// This is NOT authentication. There is no password and nothing is checked — it
// is the same self-declared name the API already trusts, just gathered in one
// place so signing in and out behave consistently. See the note in README.
//
// Two keys exist for historical reasons: the consumer screens read
// `player_name` and the owner screens read `owner_name`. They are written
// together so one person cannot end up signed in as two different people
// depending on which page they are looking at.

const KEYS = ["player_name", "owner_name"] as const;
const CHANGED = "maidaan:session-changed";

export function getName(): string {
  if (typeof window === "undefined") return "";
  // player_name wins if they somehow differ; owner_name is the fallback for
  // anyone who signed in through the owner screen before this existed.
  return (
    localStorage.getItem("player_name")?.trim() ||
    localStorage.getItem("owner_name")?.trim() ||
    ""
  );
}

export function signIn(name: string): void {
  const clean = name.trim();
  if (!clean) return;
  for (const k of KEYS) localStorage.setItem(k, clean);
  window.dispatchEvent(new Event(CHANGED));
}

export function signOut(): void {
  for (const k of KEYS) localStorage.removeItem(k);
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * Notifies on sign in/out from anywhere in this tab, plus the `storage` event
 * so a second tab stays in step. Returns an unsubscribe function.
 */
export function onSessionChange(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGED, cb);
    window.removeEventListener("storage", cb);
  };
}
