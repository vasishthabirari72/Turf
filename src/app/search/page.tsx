"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Turf {
  id: number;
  name: string;
  owner_name: string;
  locality: string;
  sport: string;
  price_per_hour: number;
  photo_emoji: string;
  photo_url: string | null;
  rating: number;
}

const SPORTS = ["All sports", "Cricket", "Football", "Badminton", "Basketball", "Tennis"];
const LOCALITIES = ["All localities", "Andheri West", "Andheri East", "Jogeshwari", "Goregaon", "Bandra"];

export default function Search() {
  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [sport, setSport] = useState("All sports");
  const [locality, setLocality] = useState("All localities");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (sport !== "All sports") qs.set("sport", sport);
    if (locality !== "All localities") qs.set("locality", locality);
    setLoading(true);
    fetch(`/api/turfs?${qs.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setTurfs(data);
        setLoading(false);
      });
  }, [sport, locality]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1" style={{ color: "var(--pitch)" }}>
        Find a turf
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>Search by locality and sport, see live availability.</p>

      <div className="flex gap-3 mb-6 flex-wrap">
        <select
          value={locality}
          onChange={(e) => setLocality(e.target.value)}
          className="tap-target border rounded-lg px-3 py-2.5 bg-white text-sm font-medium"
          style={{ borderColor: "var(--line)" }}
        >
          {LOCALITIES.map((l) => <option key={l}>{l}</option>)}
        </select>
        <select
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          className="tap-target border rounded-lg px-3 py-2.5 bg-white text-sm font-medium"
          style={{ borderColor: "var(--line)" }}
        >
          {SPORTS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        // Mirrors the real card layout so the page doesn't jump when data lands.
        <div className="grid sm:grid-cols-2 gap-4" aria-busy="true" aria-label="Loading turfs">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border p-5" style={{ borderColor: "var(--line)" }}>
              <div className="flex items-start justify-between">
                <div className="skeleton w-10 h-10 rounded-lg" />
                <div className="skeleton w-12 h-6 rounded-full" />
              </div>
              <div className="skeleton h-5 w-2/3 mt-3" />
              <div className="skeleton h-4 w-1/2 mt-2" />
              <div className="flex items-center justify-between mt-4">
                <div className="skeleton h-5 w-16" />
                <div className="skeleton h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : turfs.length === 0 ? (
        <div className="text-center py-16 rounded-xl border-2 border-dashed" style={{ borderColor: "var(--line)" }}>
          <div className="text-3xl mb-2">🔍</div>
          <div className="font-medium">No turfs match those filters</div>
          <div className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Try a different locality or sport.</div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {turfs.map((t) => (
            <Link
              key={t.id}
              href={`/turf/${t.id}`}
              className="bg-white rounded-xl border p-5 hover:shadow-md transition-shadow"
              style={{ borderColor: "var(--line)" }}
            >
              {/* Real photo when there is one; the emoji layout is the fallback,
                  so turfs listed before photos existed still look intentional. */}
              {t.photo_url ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.photo_url}
                    alt={t.name}
                    loading="lazy"
                    className="w-full h-36 rounded-lg object-cover"
                    style={{ border: "1px solid var(--line)" }}
                  />
                  <div
                    className="absolute top-2 right-2 text-xs font-semibold px-2 py-1 rounded-full"
                    style={{ background: "var(--manual-bg)", color: "#8a5a00" }}
                  >
                    ★ {t.rating.toFixed(1)}
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="text-3xl">{t.photo_emoji}</div>
                  <div className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: "var(--manual-bg)", color: "#8a5a00" }}>
                    ★ {t.rating.toFixed(1)}
                  </div>
                </div>
              )}
              <div className="font-semibold mt-3">{t.name}</div>
              <div className="text-sm mt-0.5" style={{ color: "var(--ink-soft)" }}>{t.locality} · {t.sport}</div>
              <div className="flex items-center justify-between mt-4">
                <div className="font-display font-bold" style={{ color: "var(--turf-dark)" }}>₹{t.price_per_hour}<span className="text-xs font-normal" style={{ color: "var(--ink-soft)" }}>/hr</span></div>
                <div className="text-sm font-medium" style={{ color: "var(--pitch)" }}>See slots →</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
