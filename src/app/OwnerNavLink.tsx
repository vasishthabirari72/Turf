"use client";

import Link from "next/link";
import { useMe } from "@/lib/useSession";

/**
 * The owner entry in the nav.
 *
 * Prominent for an owner account, a quiet text link for everyone else. Unlike
 * the display-preference version this replaces, the distinction now follows the
 * account's real role — and the owner screens genuinely do turn a player away,
 * so the link stays honest about where it leads.
 *
 * The markup and padding are identical in both states so the bar's width does
 * not move; only the colours change.
 */
export default function OwnerNavLink() {
  const { me, loading } = useMe();

  // Quiet for anyone who is not signed in as an owner. While the answer is
  // still loading it stays quiet too, so the prominent style never flashes at
  // someone who will not be able to use it.
  const quiet = loading || me?.role !== "owner";

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
