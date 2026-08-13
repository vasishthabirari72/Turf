"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getShows, onSessionChange } from "@/lib/session";

/**
 * The owner entry in the nav.
 *
 * Someone who said they're looking to play gets it as a quiet text link rather
 * than the filled button — still there, still one tap, just not shouting. It is
 * never removed and never disabled: /owner works exactly the same for them.
 *
 * The markup and padding are identical in both states so the bar's width does
 * not move; only the colours change.
 */
export default function OwnerNavLink() {
  // Server render and first client render must match, so start neutral (the
  // prominent style, which is also what someone with no preference sees).
  const [shows, setShows] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setShows(getShows());
    Promise.resolve().then(sync);
    return onSessionChange(sync);
  }, []);

  const quiet = shows === "player";

  return (
    <Link
      href="/owner"
      className="ml-0.5 md:ml-2 px-2 md:px-4 py-2 rounded-md tap-target flex items-center font-semibold whitespace-nowrap"
      style={
        quiet
          ? { background: "transparent", color: "var(--ink-soft)" }
          : { background: "var(--pitch)", color: "white" }
      }
    >
      <span className="md:hidden">Owner</span>
      <span className="hidden md:inline">Owner Dashboard</span>
    </Link>
  );
}
