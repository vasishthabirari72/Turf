"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getName, signIn } from "@/lib/session";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Where to go afterwards. Only same-site paths are honoured so this cannot be
  // used to bounce someone to another domain.
  const rawNext = params.get("next") || "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Pre-fill if they were signed in before; resolves async so no setState
    // happens synchronously in the effect body.
    Promise.resolve(getName()).then((existing) => {
      setName(existing);
      setReady(true);
    });
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your name to continue.");
      return;
    }
    signIn(name);
    router.push(next);
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ color: "var(--pitch)" }}>
        Sign in
      </h1>
      <p className="text-base mt-1 mb-6" style={{ color: "var(--ink-soft)" }}>
        Your name is how the app knows you — for bookings, for games you join, and
        for turfs you own.
      </p>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-5 flex flex-col gap-4" style={{ borderColor: "var(--line)" }}>
        <div>
          <label className="text-base font-semibold block mb-1.5" htmlFor="login-name">Your name</label>
          <input
            id="login-name"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            placeholder="e.g. Ramesh Patil"
            autoComplete="name"
            disabled={!ready}
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
          disabled={!ready}
          className="tap-target px-5 py-3 rounded-lg text-base font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--turf)" }}
        >
          Continue
        </button>
      </form>

      <div className="mt-5 rounded-lg p-4 text-base leading-relaxed" style={{ background: "white", border: "1px solid var(--line)", color: "var(--ink-soft)" }}>
        There is no password and no sign-up. Typing a name is all it takes, and
        nothing is checked — so treat this as a convenience, not security.
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-4 sm:px-6 py-8"><div className="skeleton h-8 w-32" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
