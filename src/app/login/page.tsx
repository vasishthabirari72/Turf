"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { refreshSession } from "@/lib/useSession";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Where to go afterwards. Only same-site paths are honoured so this cannot be
  // used to bounce someone to another domain.
  const rawNext = params.get("next") || "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !password) {
      setError("Please enter your name and password.");
      return;
    }

    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), password }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);

    if (!res.ok) {
      // Deliberately the server's single vague message: saying which half was
      // wrong would let anyone test which names are registered.
      setError(data?.error || "Could not sign you in.");
      return;
    }

    const me = await refreshSession();
    // An owner arriving with no particular destination goes to their dashboard;
    // this is a convenience, not a restriction — every page stays reachable.
    router.push(next !== "/" ? next : me?.role === "owner" ? "/owner" : "/");
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ color: "var(--pitch)" }}>
        Sign in
      </h1>
      <p className="text-base mt-1 mb-6" style={{ color: "var(--ink-soft)" }}>
        So your bookings and games stay yours on every device.
      </p>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-5 flex flex-col gap-4" style={{ borderColor: "var(--line)" }}>
        <div>
          <label className="text-base font-semibold block mb-1.5" htmlFor="login-name">Your name</label>
          <input
            id="login-name"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            placeholder="e.g. Ramesh Patil"
            autoComplete="username"
            disabled={busy}
            className="tap-target w-full border rounded-lg px-3 py-3 text-base"
            style={{ borderColor: "var(--line)" }}
          />
        </div>

        <div>
          <label className="text-base font-semibold block mb-1.5" htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            placeholder="Your password"
            autoComplete="current-password"
            disabled={busy}
            className="tap-target w-full border rounded-lg px-3 py-3 text-base"
            style={{ borderColor: "var(--line)" }}
          />
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
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-5 rounded-lg p-4 text-base leading-relaxed" style={{ background: "white", border: "1px solid var(--line)", color: "var(--ink-soft)" }}>
        New here?{" "}
        <Link href="/signup" className="underline font-medium" style={{ color: "var(--turf-dark)" }}>
          Create an account
        </Link>
        .
        <div className="mt-2">
          There is no &ldquo;forgot password&rdquo; yet. We don&apos;t collect an email
          or phone number, so there is nowhere to send a reset link — keep your
          password somewhere safe.
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-4 sm:px-6 py-8"><div className="skeleton h-8 w-40" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
