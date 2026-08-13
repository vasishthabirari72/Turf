"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { getName } from "@/lib/session";

interface Bucket {
  total: number;
  count: number;
}
interface Day {
  date: string;
  app: Bucket;
  manual: Bucket;
  notRecorded: number;
  total: number;
}
interface Revenue {
  turf: { id: number; name: string };
  today: Day;
  days: Day[];
}

function dayLabel(date: string) {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  if (date === today) return "Today";
  if (date === yesterday) return "Yesterday";
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function Collection({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Revenue | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "denied" | "error">("loading");

  const load = useCallback(() => {
    const who = getName();
    fetch(`/api/turfs/${id}/revenue?acting_as=${encodeURIComponent(who)}`)
      .then(async (r) => {
        if (r.status === 403 || r.status === 400) return { denied: true as const };
        if (!r.ok) throw new Error(String(r.status));
        return { denied: false as const, body: (await r.json()) as Revenue };
      })
      .then((res) => {
        if (res.denied) {
          setState("denied");
          return;
        }
        setData(res.body);
        setState("ok");
      })
      .catch(() => setState("error"));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state === "loading") {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8" aria-busy="true" aria-label="Loading your collection">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-8 w-56 mt-4" />
        <div className="skeleton h-32 w-full mt-6 rounded-xl" />
        <div className="skeleton h-64 w-full mt-5 rounded-xl" />
      </div>
    );
  }

  if (state === "denied" || state === "error") {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center py-16 rounded-xl border-2 border-dashed" style={{ borderColor: "var(--line)" }}>
          <div className="text-3xl mb-2">{state === "denied" ? "🔒" : "⚠️"}</div>
          <div className="font-medium text-base">
            {state === "denied" ? "This turf belongs to someone else" : "Couldn't load your collection"}
          </div>
          <div className="text-base mt-1" style={{ color: "var(--ink-soft)" }}>
            {state === "denied"
              ? "Only the person who listed this turf can see its money."
              : "Nothing has been lost. Try again in a moment."}
          </div>
          <Link
            href="/owner"
            className="tap-target inline-flex items-center mt-5 px-5 py-3 rounded-lg text-base font-semibold text-white"
            style={{ background: "var(--pitch)" }}
          >
            Go to my turfs
          </Link>
        </div>
      </div>
    );
  }

  const t = data!.today;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link
        href={`/owner/turf/${id}`}
        className="tap-target inline-flex items-center text-base font-semibold -ml-1 px-1"
        style={{ color: "var(--turf-dark)" }}
      >
        ← Back to calendar
      </Link>

      <h1 className="font-display text-2xl font-bold mt-3" style={{ color: "var(--pitch)" }}>
        Today&apos;s collection
      </h1>
      <div className="text-base mb-5" style={{ color: "var(--ink-soft)" }}>
        {data!.turf.name}
      </div>

      {/* Today, big and first — it is the number an owner checks at closing. */}
      <div className="rounded-xl p-5" style={{ background: "white", border: "1px solid var(--line)" }}>
        <div className="font-display text-4xl font-bold" style={{ color: "var(--pitch)" }}>
          ₹{t.total}
        </div>
        <div className="text-base mt-1" style={{ color: "var(--ink-soft)" }}>
          collected today, from {t.app.count + t.manual.count} booking
          {t.app.count + t.manual.count === 1 ? "" : "s"}
        </div>

        <div className="mt-4 pt-4 flex flex-col gap-2" style={{ borderTop: "1px solid var(--line)" }}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-base">Through the app</span>
            <span className="text-base font-semibold">
              ₹{t.app.total} <span style={{ color: "var(--ink-soft)" }}>· {t.app.count}</span>
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-base">Phone / walk-in</span>
            <span className="text-base font-semibold">
              ₹{t.manual.total} <span style={{ color: "var(--ink-soft)" }}>· {t.manual.count}</span>
            </span>
          </div>
        </div>

        {t.notRecorded > 0 && (
          <div
            className="mt-4 rounded-lg p-3 text-base leading-relaxed"
            style={{ background: "var(--manual-bg)", border: "1px solid var(--amber)", color: "var(--ink)" }}
          >
            <strong>
              {t.notRecorded} slot{t.notRecorded === 1 ? "" : "s"} with no amount recorded
            </strong>{" "}
            — these are not counted above. Add the amount when you block a slot and it
            will show up here.
          </div>
        )}
      </div>

      {/* Seven days as a plain list. A chart would be harder to read and easier
          to get subtly wrong than a row per day. */}
      <h2 className="font-display text-xl font-bold mt-8 mb-3" style={{ color: "var(--pitch)" }}>
        Last 7 days
      </h2>
      <div className="rounded-xl overflow-hidden" style={{ background: "white", border: "1px solid var(--line)" }}>
        {data!.days.map((d, i) => (
          <div
            key={d.date}
            className="p-4 flex items-start justify-between gap-3 flex-wrap"
            style={i > 0 ? { borderTop: "1px solid var(--line)" } : undefined}
          >
            <div className="min-w-0">
              <div className="text-base font-semibold">{dayLabel(d.date)}</div>
              <div className="text-sm mt-0.5" style={{ color: "var(--ink-soft)" }}>
                App ₹{d.app.total} ({d.app.count}) · Phone/walk-in ₹{d.manual.total} ({d.manual.count})
                {d.notRecorded > 0 && ` · ${d.notRecorded} not recorded`}
              </div>
            </div>
            <div className="font-display text-xl font-bold whitespace-nowrap" style={{ color: d.total > 0 ? "var(--turf-dark)" : "var(--ink-soft)" }}>
              ₹{d.total}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-lg p-4 text-base leading-relaxed" style={{ background: "white", border: "1px solid var(--line)", color: "var(--ink-soft)" }}>
        <strong style={{ color: "var(--ink)" }}>This counts everything.</strong> Bookings
        made in the app and the ones you take by phone both land here, so this is your
        whole day — not just the part that came through the app.
      </div>
    </div>
  );
}
