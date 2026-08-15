"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut as sessionSignOut, useMe } from "@/lib/useSession";

interface SavedUser {
  name: string;
  phone: string | null;
  role: string | null;
}

export default function Profile() {
  const router = useRouter();
  const { me, loading: meLoading } = useMe();

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Distinguishes "nothing saved yet" from "we couldn't reach the server".
  // Those look identical on screen otherwise — a blank form — and the second
  // one is dangerous: saving from it would overwrite a stored number with "".
  // Deliberately contains no synchronous setState, so the effect below can call
  // it directly; the retry button raises the spinner itself.
  const loadProfile = useCallback(() => {
    // No name is sent: the server answers for whoever the session cookie says
    // you are. The old version passed ?name=, which handed anyone's phone
    // number to anyone who asked.
    fetch("/api/users", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return { ok: true, user: (await r.json()) as SavedUser | null };
      })
      .catch(() => ({ ok: false, user: null as SavedUser | null }))
      .then(({ ok, user }) => {
        if (user) setPhone(user.phone || "");
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
    setSaving(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone.trim() }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);

    if (!res.ok) {
      setError(data?.error || "Could not save your details.");
      return;
    }
    setSaved(true);
  }

  if (loading || meLoading) {
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

  if (!me) {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-bold mb-2" style={{ color: "var(--pitch)" }}>
          Your profile
        </h1>
        <p className="text-base mb-6" style={{ color: "var(--ink-soft)" }}>
          Sign in to see your details.
        </p>
        <Link
          href="/login?next=/profile"
          className="tap-target inline-block px-5 py-3 rounded-lg text-base font-semibold text-white"
          style={{ background: "var(--turf)" }}
        >
          Sign in
        </Link>
      </div>
    );
  }

  const isOwner = me.role === "owner";

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ color: "var(--pitch)" }}>
        Your profile
      </h1>
      <p className="text-base mt-1 mb-6" style={{ color: "var(--ink-soft)" }}>
        Saved so you don&apos;t have to type it again every time you book.
      </p>

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
          <div className="text-base font-semibold block mb-1.5">Name</div>
          <div
            id="profile-name"
            className="w-full border rounded-lg px-3 py-3 text-base"
            style={{ borderColor: "var(--line)", background: "var(--paper)", color: "var(--ink)" }}
          >
            {me.name}
          </div>
          <div className="text-sm mt-1.5" style={{ color: "var(--ink-soft)" }}>
            This is the name you sign in with, so it can&apos;t be changed here.
            It is also the name shown on your bookings and game requests.
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

      {/* Account type is shown, not chosen. It decides what the account may do,
          so unlike the old cosmetic "You are" chips it is not editable here —
          letting anyone set it would let anyone grant themselves the owner
          tools. */}
      <div className="mt-5 rounded-xl p-5" style={{ background: "white", border: "1px solid var(--line)" }}>
        <div className="font-semibold text-base" style={{ color: "var(--pitch)" }}>Account type</div>
        <div className="mt-2 mb-2 text-base font-semibold" style={{ color: "var(--ink)" }}>
          {isOwner ? "🏟  Turf owner" : "⚽  Player"}
        </div>
        <div className="text-base" style={{ color: "var(--ink-soft)" }}>
          {isOwner
            ? "You can list turfs, take bookings and see your collection, as well as book turfs and join games."
            : "You can book turfs and join games. The turf owner tools are only on owner accounts — if you run a turf, get in touch and we'll set that up."}
        </div>
      </div>

      <div className="mt-5 rounded-xl p-5" style={{ background: "white", border: "1px solid var(--line)" }}>
        <div className="font-semibold text-base" style={{ color: "var(--pitch)" }}>Signed in as {me.name}</div>
        <div className="text-base mt-1 mb-4" style={{ color: "var(--ink-soft)" }}>
          Signing out ends your session on this device. Your bookings and games
          stay where they are — sign back in to see them.
        </div>
        <button
          type="button"
          onClick={async () => { await sessionSignOut(); router.push("/login"); }}
          className="tap-target px-5 py-3 rounded-lg text-base font-semibold border"
          style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--paper)" }}
        >
          Sign out
        </button>
      </div>

      <div className="mt-5 rounded-lg p-4 text-base leading-relaxed" style={{ background: "white", border: "1px solid var(--line)", color: "var(--ink-soft)" }}>
        Your account is your name and password. There is no &ldquo;forgot
        password&rdquo; yet — we don&apos;t collect an email or phone number, so
        there is nowhere to send a reset link.{" "}
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
