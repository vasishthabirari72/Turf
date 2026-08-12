"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getName, onSessionChange } from "@/lib/session";

/**
 * The identity slot in the nav. Deliberately the same width whether signed in
 * or out — the bar has very little room at 375px, so this shows an icon on
 * phones and a short word on wider screens, never a name that could be any
 * length.
 */
export default function SessionNavLink() {
  // Server render and first client render must match, so start neutral and
  // correct after mount.
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setName(getName());
    Promise.resolve().then(sync);
    return onSessionChange(sync);
  }, []);

  const signedIn = !!name;
  const href = signedIn ? "/profile" : "/login";
  const label = signedIn ? "Profile" : "Sign in";

  return (
    <Link
      href={href}
      aria-label={signedIn ? `Your profile, signed in as ${name}` : "Sign in"}
      className="px-1.5 md:px-3 py-2 rounded-md hover:bg-black/5 tap-target flex items-center whitespace-nowrap"
    >
      <span className="md:hidden text-base leading-none" aria-hidden="true">
        {signedIn ? "👤" : "🔑"}
      </span>
      <span className="hidden md:inline">{label}</span>
    </Link>
  );
}
