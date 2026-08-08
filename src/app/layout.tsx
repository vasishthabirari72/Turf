import type { Metadata } from "next";
import Link from "next/link";
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
              className="font-display text-base sm:text-xl font-bold flex items-center gap-1.5 sm:gap-2 min-w-0 truncate"
              style={{ color: "var(--pitch)" }}
            >
              <span
                className="inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-md text-sm shrink-0"
                style={{ background: "var(--turf)", color: "white" }}
              >
                🏟
              </span>
              {/* On narrow phones the wordmark would eat the room the nav needs (and
                  truncate mid-word to "Maidaan C", which reads as a glitch). 374px is
                  the cutoff: 360px Androids get the short mark, 375px iPhones keep the
                  full one. */}
              Maidaan<span className="max-[374px]:hidden" style={{ color: "var(--turf-dark)" }}>Connect</span>
            </Link>
            {/* Labels shorten below sm so the whole bar fits a 375px phone without
                wrapping or scrolling sideways. */}
            <nav className="flex items-center gap-0.5 sm:gap-1 text-sm font-medium shrink-0">
              <Link href="/search" className="px-1.5 sm:px-3 py-2 rounded-md hover:bg-black/5 tap-target flex items-center whitespace-nowrap">
                <span className="sm:hidden">Turfs</span>
                <span className="hidden sm:inline">Find a Turf</span>
              </Link>
              <Link href="/players" className="px-1.5 sm:px-3 py-2 rounded-md hover:bg-black/5 tap-target flex items-center whitespace-nowrap">
                <span className="sm:hidden">Players</span>
                <span className="hidden sm:inline">Find Players</span>
              </Link>
              <Link
                href="/owner"
                className="ml-0.5 sm:ml-2 px-2 sm:px-4 py-2 rounded-md tap-target flex items-center font-semibold whitespace-nowrap"
                style={{ background: "var(--pitch)", color: "white" }}
              >
                <span className="sm:hidden">Owner</span>
                <span className="hidden sm:inline">Owner Dashboard</span>
              </Link>
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
