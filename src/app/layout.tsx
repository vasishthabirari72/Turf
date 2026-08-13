import type { Metadata } from "next";
import Link from "next/link";
import SessionNavLink from "./SessionNavLink";
import OwnerNavLink from "./OwnerNavLink";
import "./globals.css";

export const metadata: Metadata = {
  title: "MaidaanConnect — Find & Book Turfs Near You",
  description: "Book turfs and find players near you.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col" style={{ background: "var(--chalk)" }}>
        <header
          className="sticky top-0 z-20 border-b"
          style={{ borderColor: "var(--line)", background: "var(--paper)" }}
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <Link
              href="/"
              className="font-display text-base md:text-xl font-bold flex items-center gap-1.5 md:gap-2 min-w-0 truncate"
              style={{ color: "var(--pitch)" }}
            >
              <span
                className="inline-flex items-center justify-center w-7 h-7 md:w-8 md:h-8 rounded-md text-sm shrink-0"
                style={{ background: "var(--turf)", color: "white" }}
              >
                🏟
              </span>
              {/* The wordmark competes with the nav for a fixed bar, and four nav
                  items leave little room. Below 360px only the icon shows, phones
                  get "Maidaan", and the full "MaidaanConnect" returns at md — where
                  the nav also switches to its full labels. */}
              <span className="max-[359px]:hidden truncate">
                Maidaan<span className="hidden md:inline" style={{ color: "var(--turf-dark)" }}>Connect</span>
              </span>
            </Link>
            {/* Labels shorten below md so the whole bar fits a phone without
                wrapping or scrolling sideways. */}
            <nav className="flex items-center gap-0.5 md:gap-1 text-sm font-medium shrink-0">
              <Link href="/search" className="px-1.5 md:px-3 py-2 rounded-md hover:bg-black/5 tap-target flex items-center whitespace-nowrap">
                <span className="md:hidden">Turfs</span>
                <span className="hidden md:inline">Find a Turf</span>
              </Link>
              <Link href="/players" className="px-1.5 md:px-3 py-2 rounded-md hover:bg-black/5 tap-target flex items-center whitespace-nowrap">
                <span className="md:hidden">Players</span>
                <span className="hidden md:inline">Find Players</span>
              </Link>
              {/* Identity slot: "Sign in" when signed out, "Profile" when signed in.
                  Icon-only below md — a fourth text label does not fit a 375px bar. */}
              <SessionNavLink />
              {/* Prominent by default and for owners; a quiet link for someone who
                  said they're here to play. Never removed — /owner stays open. */}
              <OwnerNavLink />
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t py-6 text-center text-sm" style={{ borderColor: "var(--line)", color: "var(--ink-soft)" }}>
          MaidaanConnect — a demo build. Not for production use yet.
        </footer>
      </body>
    </html>
  );
}
