"use client";

import { useState } from "react";
import Link from "next/link";
import { refreshSession } from "@/lib/useSession";

const MIN_PASSWORD_LENGTH = 8;

type Role = "player" | "owner";

export default function SignUp() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Please enter your name.");
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Please choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (!role) return setError("Please choose how you will use MaidaanConnect.");

    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), password, role }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);

    if (!res.ok) {
      setError(data?.error || "Could not create your account.");
      return;
    }
    await refreshSession();
    // A full navigation, not router.push. The nav's Owner link is prefetched
    // while this page is still signed out, so Next has already cached proxy.ts
    // redirecting /owner to /login; a client-side push replays that cached
    // redirect and bounces a brand-new owner straight back to sign-in. Signing
    // in changes who every page is for, so discarding the router cache is right
    // regardless. (Not reproducible in dev: prefetching is off there.)
    window.location.assign(role === "owner" ? "/owner" : "/search");
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ color: "var(--pitch)" }}>
        Create your account
      </h1>
      <p className="text-base mt-1 mb-6" style={{ color: "var(--ink-soft)" }}>
        Your name and a password. Nothing else to fill in.
      </p>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-5 flex flex-col gap-4" style={{ borderColor: "var(--line)" }}>
        <div>
          <label className="text-base font-semibold block mb-1.5" htmlFor="signup-name">Your name</label>
          <input
            id="signup-name"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            placeholder="e.g. Ramesh Patil"
            autoComplete="username"
            disabled={busy}
            className="tap-target w-full border rounded-lg px-3 py-3 text-base"
            style={{ borderColor: "var(--line)" }}
          />
          <div className="text-sm mt-1.5" style={{ color: "var(--ink-soft)" }}>
            This is how you sign in, and the name shown on your bookings.
          </div>
        </div>

        <div>
          <label className="text-base font-semibold block mb-1.5" htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            autoComplete="new-password"
            disabled={busy}
            className="tap-target w-full border rounded-lg px-3 py-3 text-base"
            style={{ borderColor: "var(--line)" }}
          />
          <div className="text-sm mt-1.5" style={{ color: "var(--ink-soft)" }}>
            Please write it down somewhere safe — see the note at the bottom.
          </div>
        </div>

        <div>
          <div className="text-base font-semibold mb-1.5">How will you use MaidaanConnect?</div>
          <div className="flex flex-col gap-3">
            {([
              { key: "player" as const, icon: "⚽", title: "I'm looking to play", sub: "Book turfs and join games" },
              { key: "owner" as const, icon: "🏟", title: "I manage a turf", sub: "Take bookings and keep the day's collection" },
            ]).map((opt) => {
              const active = role === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setRole(opt.key); setError(null); }}
                  disabled={busy}
                  className="tap-target w-full px-5 py-4 rounded-xl text-left border-2 flex items-center gap-3"
                  style={
                    active
                      ? { borderColor: "var(--pitch)", background: "#EAF6EB" }
                      : { borderColor: "var(--line)", background: "var(--paper)" }
                  }
                >
                  <span className="text-2xl leading-none" aria-hidden="true">{opt.icon}</span>
                  <span>
                    <span className="block text-base font-semibold">{opt.title}</span>
                    <span className="block text-sm" style={{ color: "var(--ink-soft)" }}>{opt.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="text-sm mt-2" style={{ color: "var(--ink-soft)" }}>
            Turf owners get the tools for taking bookings and recording the day&apos;s
            collection. Anyone can book a turf and join games either way.
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

        <button
          type="submit"
          disabled={busy}
          className="tap-target px-5 py-3 rounded-lg text-base font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--turf)" }}
        >
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>

      <div className="mt-5 rounded-lg p-4 text-base leading-relaxed" style={{ background: "white", border: "1px solid var(--line)", color: "var(--ink-soft)" }}>
        Already have an account?{" "}
        <Link href="/login" className="underline font-medium" style={{ color: "var(--turf-dark)" }}>
          Sign in
        </Link>
        .
        <div className="mt-2">
          <strong>Please keep your password safe.</strong> We don&apos;t ask for an
          email or phone number yet, so there is no way to send you a reset link
          if you forget it.
        </div>
      </div>
    </div>
  );
}
