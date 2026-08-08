import Link from "next/link";

export default function Home() {
  return (
    <div className="pitch-lines">
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="max-w-2xl">
          <span
            className="inline-block text-xs font-semibold tracking-wide uppercase px-3 py-1 rounded-full mb-6"
            style={{ background: "var(--manual-bg)", color: "#8a5a00" }}
          >
            Andheri, Mumbai — early access
          </span>
          <h1 className="font-display text-4xl sm:text-5xl font-bold leading-[1.05]" style={{ color: "var(--pitch)" }}>
            Stop calling five turfs
            <br />
            to find one that&apos;s free.
          </h1>
          <p className="mt-5 text-lg" style={{ color: "var(--ink-soft)" }}>
            See every turf near you, real slots, real prices — and if you&apos;re short on
            players, find people nearby who need one more for their game.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/search"
              className="tap-target inline-flex items-center px-6 py-3 rounded-lg font-semibold text-white"
              style={{ background: "var(--turf)" }}
            >
              Find a turf →
            </Link>
            <Link
              href="/players"
              className="tap-target inline-flex items-center px-6 py-3 rounded-lg font-semibold border-2"
              style={{ borderColor: "var(--pitch)", color: "var(--pitch)" }}
            >
              Find players to join
            </Link>
          </div>
        </div>

        <div className="mt-16 grid sm:grid-cols-3 gap-4">
          {[
            { emoji: "📍", title: "Search your locality", body: "Filter by sport, price, and distance — no more scrolling Google Maps." },
            { emoji: "🗓", title: "See real availability", body: "Live slot grid per turf, updated by the owner in real time." },
            { emoji: "🤝", title: "Short on players?", body: "Post what you need and join others' open games nearby." },
          ].map((c) => (
            <div key={c.title} className="bg-white rounded-xl border p-5" style={{ borderColor: "var(--line)" }}>
              <div className="text-2xl mb-3">{c.emoji}</div>
              <div className="font-semibold mb-1" style={{ color: "var(--pitch)" }}>{c.title}</div>
              <div className="text-sm" style={{ color: "var(--ink-soft)" }}>{c.body}</div>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-xl border p-5 flex items-center justify-between flex-wrap gap-4" style={{ background: "var(--pitch)", borderColor: "var(--pitch)" }}>
          <div>
            <div className="font-display text-lg font-semibold text-white">Own a turf?</div>
            <div className="text-sm" style={{ color: "#D7E8DC" }}>List it in under two minutes and manage phone bookings alongside app bookings.</div>
          </div>
          <Link
            href="/owner"
            className="tap-target inline-flex items-center px-5 py-2.5 rounded-lg font-semibold whitespace-nowrap"
            style={{ background: "var(--amber)", color: "var(--pitch)" }}
          >
            Open owner dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}
