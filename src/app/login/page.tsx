"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getName, signIn, type Shows } from "@/lib/session";

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
  // Two steps: name, then which set of links to lead with. Nothing here is a
  // permission — it only decides what the menu shows first.
  const [step, setStep] = useState<"name" | "shows">("name");

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
    setError(null);
    setStep("shows");
  }

  function choose(shows: Shows) {
    signIn(name, shows);
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

      {step === "shows" ? (
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: "var(--line)" }}>
          <div className="font-semibold text-base" style={{ color: "var(--pitch)" }}>
            How are you using MaidaanConnect?
          </div>
          <div className="text-base mt-1 mb-4" style={{ color: "var(--ink-soft)" }}>
            Just so we put the right things in your menu. You can change it any time,
            and everything stays open to you either way.
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => choose("player")}
              className="tap-target w-full px-5 py-4 rounded-xl text-left border-2 flex items-center gap-3"
              style={{ borderColor: "var(--turf)", background: "var(--paper)" }}
            >
              <span className="text-2xl leading-none" aria-hidden="true">⚽</span>
              <span>
                <span className="block text-base font-semibold">I&apos;m looking to play</span>
                <span className="block text-sm" style={{ color: "var(--ink-soft)" }}>
                  Find turfs and join games
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => choose("owner")}
              className="tap-target w-full px-5 py-4 rounded-xl text-left border-2 flex items-center gap-3"
              style={{ borderColor: "var(--pitch)", background: "var(--paper)" }}
            >
              <span className="text-2xl leading-none" aria-hidden="true">🏟</span>
              <span>
                <span className="block text-base font-semibold">I manage a turf</span>
                <span className="block text-sm" style={{ color: "var(--ink-soft)" }}>
                  Take bookings and keep the day&apos;s collection
                </span>
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setStep("name")}
            className="tap-target mt-4 text-base font-semibold underline -ml-1 px-1"
            style={{ color: "var(--turf-dark)" }}
          >
            ← Change name
          </button>
        </div>
      ) : (
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
      )}

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
