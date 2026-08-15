"use client";

import { useEffect, useState } from "react";

/**
 * Who the server says you are, for the client to render with.
 *
 * This is display state, not a permission. Nothing here decides whether an
 * action is allowed — every protected route re-checks the session cookie on the
 * server, so tampering with this only changes what a person sees on their own
 * screen. See lib/auth.ts for the checks that actually hold.
 *
 * The cookie itself is httpOnly, so this cannot read it; it asks the server.
 */

export type Role = "player" | "owner";

export interface Me {
  id: number;
  name: string;
  role: Role;
}

const CHANGED = "maidaan:session-changed";

// undefined = not fetched yet, null = fetched and signed out.
let cache: Me | null | undefined;
let inflight: Promise<Me | null> | null = null;

/** One request even if ten components mount at once. */
export function fetchMe(force = false): Promise<Me | null> {
  if (!force && cache !== undefined) return Promise.resolve(cache);
  if (!force && inflight) return inflight;

  inflight = fetch("/api/auth/me", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { user: null }))
    .then((d) => {
      cache = (d?.user ?? null) as Me | null;
      return cache;
    })
    .catch(() => {
      // A failed lookup is treated as signed out for display purposes. It
      // cannot grant anything: the server is what decides on every request.
      cache = null;
      return cache;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

function announce() {
  window.dispatchEvent(new Event(CHANGED));
}

/** Call after signing in or out so every mounted component re-reads. */
export function refreshSession(): Promise<Me | null> {
  return fetchMe(true).then((me) => {
    announce();
    return me;
  });
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  // Anything the old name-based model left behind is cleared too, so a signed
  // out browser has no leftover name to pre-fill or mislead with.
  try {
    for (const k of ["player_name", "owner_name", "maidaan_shows"]) {
      localStorage.removeItem(k);
    }
  } catch {
    /* private browsing */
  }
  await refreshSession();
}

export function onSessionChange(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

/**
 * `loading` matters: signed-out and not-yet-known look the same otherwise, and
 * rendering "please sign in" for a moment to someone who is signed in is the
 * flash this app already had trouble with once.
 */
export function useMe(): { me: Me | null; loading: boolean } {
  const [me, setMe] = useState<Me | null>(cache ?? null);
  const [loading, setLoading] = useState(cache === undefined);

  useEffect(() => {
    let alive = true;
    const sync = () =>
      fetchMe().then((m) => {
        if (!alive) return;
        setMe(m);
        setLoading(false);
      });
    sync();
    const off = onSessionChange(sync);
    return () => {
      alive = false;
      off();
    };
  }, []);

  return { me, loading };
}
