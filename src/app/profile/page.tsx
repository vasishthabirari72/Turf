"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getShows, setShows, signIn as sessionSignIn, signOut as sessionSignOut, type Shows } from "@/lib/session";

const ROLES = [
  { key: "player", label: "I play" },
  { key: "owner", label: "I own a turf" },
  { key: "both", label: "Both" },
];

interface SavedUser {
  phone: string | null;
  role: string | null;
}

export default function Profile() {
  const router = useRouter();
  // Same localStorage key the rest of the app uses to identify someone.
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("player");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which links to lead with. Display only — see the note in lib/session.ts.
  const [shows, setShowsState] = useState<Shows | null>(null);

  // Distinguishes "nothing saved yet" from "we couldn't reach the server".
  // Those look identical on screen otherwise — a blank form — and the second
  // one is dangerous: saving from it would overwrite a stored number with "".
  // Deliberately contains no synchronous setState, so the effect below can call
  // it directly; the retry button raises the spinner itself.
  const loadProfile = useCallback(() => {
    const stored = localStorage.getItem("player_name") || "";

    // The no-name branch still resolves through a promise so that every state
    // update below happens asynchronously rather than in the effect body.
    const load: Promise<{ ok: boolean; user: SavedUser | null }> = stored
      ? fetch(`/api/users?name=${encodeURIComponent(stored)}`)
          .then(async (r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return { ok: true, user: (await r.json()) as SavedUser | null };
          })
          .catch(() => ({ ok: false, user: null }))
      : Promise.resolve({ ok: true, user: null });

    load.then(({ ok, user }) => {
      setName(stored);
      if (user) {
        setPhone(user.phone || "");
        if (user.role) setRole(user.role);
      }
      setShowsState(getShows());
      setLoadFailed(!ok);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (loadFailed) {
      setError("Still can't load your saved details — try again before saving.");
      return;
    }
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), phone: phone.trim(), role }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || "Could not save your details.");
      return;
    }
    // Saving a name is also signing in under it; this keeps the consumer and
    // owner keys in step so one person is not two identities.
    sessionSignIn(name.trim());
    setSaved(true);
  }

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 py-8" aria-busy="true" aria-label="Loading your details">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-4 w-64 mt-3" />
        <div className="skeleton h-14 w-full mt-8" />
        <div className="skeleton h-14 w-full mt-4" />
        <div className="skeleton h-12 w-32 mt-6" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ color: "var(--pitch)" }}>
        Your profile
      </h1>
      <p className="text-base mt-1 mb-6" style={{ color: "var(--ink-soft)" }}>
        Saved so you don&apos;t have to type it again every time you book.
      </p>

      {/* Saving from a form we failed to populate would replace a stored number
          with an empty one, so the form is held until the load succeeds. */}
      {loadFailed && (
        <div
          role="alert"
          className="mb-5 rounded-lg p-4 text-base leading-relaxed"
          style={{ background: "var(--manual-bg)", border: "1px solid var(--amber)", color: "var(--ink)" }}
        >
          <strong>Couldn&apos;t load your saved details.</strong> Nothing has been lost —
          we just can&apos;t show them right now. Saving is paused so it doesn&apos;t
          overwrite what you already had.
          <button
            type="button"
            onClick={() => { setLoading(true); loadProfile(); }}
            className="tap-target block mt-3 px-5 py-2.5 rounded-lg text-base font-semibold text-white"
            style={{ background: "var(--pitch)" }}
          >
            Try again
          </button>
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white rounded-xl border p-5 flex flex-col gap-4" style={{ borderColor: "var(--line)" }}>
        <div className="font-semibold text-base" style={{ color: "var(--pitch)" }}>Your details</div>

        <div>
          <label className="text-base font-semibold block mb-1.5" htmlFor="profile-name">Name</label>
          <input
            id="profile-name"
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
            placeholder="e.g. Ramesh Patil"
            disabled={saving || loadFailed}
            className="tap-target w-full border rounded-lg px-3 py-3 text-base"
            style={{ borderColor: "var(--line)" }}
          />
          <div className="text-sm mt-1.5" style={{ color: "var(--ink-soft)" }}>
            This is the name shown on your bookings and game requests.
          </div>
        </div>

        <div>
          <label className="text-base font-semibold block mb-1.5" htmlFor="profile-phone">Phone number</label>
          <input
            id="profile-phone"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setSaved(false); }}
            placeholder="e.g. 98765 43210"
            inputMode="tel"
            autoComplete="tel"
            disabled={saving || loadFailed}
            className="tap-target w-full border rounded-lg px-3 py-3 text-base"
            style={{ borderColor: "var(--line)" }}
          />
          <div className="text-sm mt-1.5" style={{ color: "var(--ink-soft)" }}>
            Optional. Nobody checks this number — it is only saved here so a turf
            owner can reach you about a booking.
          </div>
        </div>

        <div>
          <div className="text-base font-semibold mb-1.5">You are</div>
          <div className="flex gap-2 flex-wrap">
            {ROLES.map((r) => {
              const active = role === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => { setRole(r.key); setSaved(false); }}
                  aria-pressed={active}
                  disabled={saving || loadFailed}
                  className="tap-target px-4 py-2.5 rounded-lg text-base font-medium border disabled:opacity-60"
                  style={
                    active
                      ? { background: "var(--pitch)", borderColor: "var(--pitch)", color: "white" }
                      : { background: "var(--paper)", borderColor: "var(--line)", color: "var(--ink)" }
                  }
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg px-3 py-2.5 text-base font-medium"
            style={{ background: "var(--booked-bg)", border: "1px solid var(--danger)", color: "var(--danger)" }}
          >
            {error}
          </div>
        )}

        {saved && (
          <div
            role="status"
            className="rounded-lg px-3 py-2.5 text-base font-medium"
            style={{ background: "#EAF6EB", border: "1px solid var(--turf)", color: "var(--turf-dark)" }}
          >
            Saved. Your details will be filled in next time.
          </div>
        )}

        <button
          type="submit"
          disabled={saving || loadFailed}
          className="tap-target self-start px-5 py-3 rounded-lg text-base font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--turf)" }}
        >
          {saving ? "Saving…" : "Save details"}
        </button>
      </form>

      {/* A menu preference, nothing more. Deliberately worded so it cannot be
          mistaken for a permission: every page stays open either way. */}
      <div className="mt-5 rounded-xl p-5" style={{ background: "white", border: "1px solid var(--line)" }}>
        <div className="font-semibold text-base" style={{ color: "var(--pitch)" }}>Show me</div>
        <div className="text-base mt-1 mb-4" style={{ color: "var(--ink-soft)" }}>
          Changes what your menu puts first. Nothing is hidden from you — you can
          open any part of the app whichever you pick.
        </div>
        <div className="flex gap-2 flex-wrap">
          {([
            { key: "player" as const, label: "Places to play" },
            { key: "owner" as const, label: "My turf" },
          ]).map((opt) => {
            const active = shows === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                aria-pressed={active}
                onClick={() => { setShows(opt.key); setShowsState(opt.key); }}
                className="tap-target px-4 py-2.5 rounded-lg text-base font-medium border"
                style={
                  active
                    ? { background: "var(--pitch)", borderColor: "var(--pitch)", color: "white" }
                    : { background: "var(--paper)", borderColor: "var(--line)", color: "var(--ink)" }
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 rounded-xl p-5" style={{ background: "white", border: "1px solid var(--line)" }}>
        <div className="font-semibold text-base" style={{ color: "var(--pitch)" }}>Signed in as {name || "nobody"}</div>
        <div className="text-base mt-1 mb-4" style={{ color: "var(--ink-soft)" }}>
          Signing out clears your name from this device. Your bookings and games
          stay where they are — sign back in with the same name to see them.
        </div>
        <button
          type="button"
          onClick={() => { sessionSignOut(); router.push("/login"); }}
          className="tap-target px-5 py-3 rounded-lg text-base font-semibold border"
          style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--paper)" }}
        >
          Sign out
        </button>
      </div>

      <div className="mt-5 rounded-lg p-4 text-base leading-relaxed" style={{ background: "white", border: "1px solid var(--line)", color: "var(--ink-soft)" }}>
        There is no password and no sign-up here. Your name is how the app knows
        you, so changing it above means new bookings use the new name — anything
        booked earlier stays under the old one.{" "}
        <Link href="/search" className="underline font-medium" style={{ color: "var(--turf-dark)" }}>
          Find a turf
        </Link>{" "}
        or{" "}
        <Link href="/players" className="underline font-medium" style={{ color: "var(--turf-dark)" }}>
          find players
        </Link>.
      </div>
    </div>
  );
}
