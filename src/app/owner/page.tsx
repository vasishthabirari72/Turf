"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMe, signOut as sessionSignOut } from "@/lib/useSession";

interface Turf {
  id: number;
  name: string;
  locality: string;
  sport: string;
  price_per_hour: number;
  photo_emoji: string;
}

const SPORTS = ["Cricket", "Football", "Badminton", "Basketball", "Tennis"];
const LOCALITIES = ["Andheri West", "Andheri East", "Jogeshwari", "Goregaon", "Bandra"];

export default function OwnerDashboard() {
  // Who this is comes from the session cookie, not from a name typed into the
  // page. proxy.ts has already turned away anyone without an owner session, and
  // every request below is re-checked server-side regardless.
  const { me, loading: meLoading } = useMe();
  const ownerName = me?.name ?? "";
  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false); // form submit
  const [turfsLoading, setTurfsLoading] = useState(true); // initial turf list
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Today's combined take per turf, keyed by turf id. Loaded after the list so
  // a slow figure never holds up the turfs themselves.
  const [todayTotals, setTodayTotals] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!ownerName || turfs.length === 0) return;
    let cancelled = false;
    Promise.all(
      turfs.map((t) =>
        fetch(`/api/turfs/${t.id}/revenue`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => [t.id, d?.today?.total ?? 0] as const)
          .catch(() => [t.id, 0] as const)
      )
    ).then((pairs) => {
      if (!cancelled) setTodayTotals(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [ownerName, turfs]);

  useEffect(() => {
    if (!ownerName) return;
    fetch(`/api/turfs?mine=1`)
      .then((r) => r.json())
      .then((data) => {
        setTurfs(data);
        // Until this resolves the list is empty, which would otherwise render
        // "No turfs listed yet" to an owner who does have turfs.
        setTurfsLoading(false);
      });
  }, [ownerName]);

  function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    setFormError(null);
    // Local preview only — nothing is uploaded until the form is submitted.
    setPhotoPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function handleAddTurf(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    const form = new FormData(e.currentTarget);

    // Upload first: if the photo fails we stop here rather than creating a turf
    // that silently has no picture.
    let photoUrl: string | null = null;
    if (photoFile) {
      const fd = new FormData();
      fd.append("file", photoFile);
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const upData = await up.json();
      if (!up.ok) {
        setFormError(upData.error || "Could not upload that photo.");
        setLoading(false);
        return;
      }
      photoUrl = upData.url;
    }

    const payload = {
      name: form.get("name"),
      locality: form.get("locality"),
      sport: form.get("sport"),
      price_per_hour: Number(form.get("price")),
      photo_emoji: form.get("sport") === "Cricket" ? "🏏" : form.get("sport") === "Badminton" ? "🏸" : "⚽",
      photo_url: photoUrl,
    };
    const res = await fetch("/api/turfs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const newTurf = await res.json();
    if (!res.ok) {
      setFormError(newTurf.error || "Could not add that turf.");
      setLoading(false);
      return;
    }
    setTurfs((prev) => [newTurf, ...prev]);
    setShowForm(false);
    setPhotoFile(null);
    setPhotoPreview(null);
    setLoading(false);
  }

  // Reaching here without an owner session means proxy.ts is mid-redirect, so
  // this is a brief wait rather than a screen anyone lands on.
  if (meLoading || !ownerName) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8" aria-busy="true" aria-label="Loading your turfs">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-4 w-32 mt-3" />
        <div className="skeleton h-28 w-full mt-8" />
        <div className="skeleton h-28 w-full mt-4" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
        <div>
          <div className="text-sm" style={{ color: "var(--ink-soft)" }}>Welcome back,</div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--pitch)" }}>{ownerName}</h1>
          <button
            type="button"
            onClick={async () => { await sessionSignOut(); window.location.assign("/login"); }}
            className="tap-target text-base font-semibold underline -ml-1 px-1"
            style={{ color: "var(--danger)" }}
          >
            Sign out
          </button>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="tap-target px-5 py-3 rounded-lg text-base font-semibold text-white"
          style={{ background: "var(--turf)" }}
        >
          {showForm ? "Cancel" : "+ Add a turf"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleAddTurf}
          className="bg-white rounded-xl border p-5 mb-8 grid sm:grid-cols-2 gap-4"
          style={{ borderColor: "var(--line)" }}
        >
          <div className="sm:col-span-2">
            <label className="text-base font-semibold block mb-1.5">Turf name</label>
            <input name="name" required className="tap-target w-full border rounded-lg px-3 py-3 text-base" style={{ borderColor: "var(--line)" }} placeholder="e.g. Green Arena Box Cricket" />
          </div>
          <div>
            <label className="text-base font-semibold block mb-1.5">Sport</label>
            <select name="sport" required className="tap-target w-full border rounded-lg px-3 py-3 text-base" style={{ borderColor: "var(--line)" }}>
              {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-base font-semibold block mb-1.5">Area</label>
            <select name="locality" required className="tap-target w-full border rounded-lg px-3 py-3 text-base" style={{ borderColor: "var(--line)" }}>
              {LOCALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-base font-semibold block mb-1.5">Price per hour (₹)</label>
            <input name="price" type="number" required min={1} className="tap-target w-full border rounded-lg px-3 py-3 text-base" style={{ borderColor: "var(--line)" }} placeholder="800" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-base font-semibold block mb-1.5" htmlFor="turf-photo">
              Photo of your turf <span style={{ color: "var(--ink-soft)" }}>(optional)</span>
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoPreview}
                  alt="Preview of the photo you picked"
                  className="w-24 h-20 rounded-lg object-cover shrink-0"
                  style={{ border: "1px solid var(--line)" }}
                />
              ) : (
                <div
                  className="w-24 h-20 rounded-lg flex items-center justify-center text-2xl shrink-0"
                  style={{ background: "var(--chalk)", border: "1px dashed var(--line)" }}
                >
                  📷
                </div>
              )}
              <input
                id="turf-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoPick}
                disabled={loading}
                className="tap-target flex-1 min-w-40 text-base"
              />
            </div>
            <div className="text-sm mt-2" style={{ color: "var(--ink-soft)" }}>
              JPG, PNG or WebP, up to 5MB. Without one we&apos;ll show a sport icon instead.
            </div>
          </div>

          {formError && (
            <div
              role="alert"
              className="sm:col-span-2 rounded-lg px-3 py-2.5 text-base font-medium"
              style={{ background: "var(--booked-bg)", border: "1px solid var(--danger)", color: "var(--danger)" }}
            >
              {formError}
            </div>
          )}

          <div className="sm:col-span-2">
            <button
              disabled={loading}
              type="submit"
              className="tap-target px-5 py-3 rounded-lg text-base font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--pitch)" }}
            >
              {loading ? "Saving…" : "Save turf"}
            </button>
          </div>
        </form>
      )}

      {turfsLoading ? (
        <div className="grid sm:grid-cols-2 gap-4" aria-busy="true" aria-label="Loading your turfs">
          {[0, 1].map((i) => (
            <div key={i} className="bg-white rounded-xl border p-5 flex items-center gap-4" style={{ borderColor: "var(--line)" }}>
              <div className="skeleton w-10 h-10 rounded-lg shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="skeleton h-5 w-3/4" />
                <div className="skeleton h-4 w-1/2 mt-2" />
              </div>
            </div>
          ))}
        </div>
      ) : turfs.length === 0 ? (
        <div className="text-center py-16 rounded-xl border-2 border-dashed" style={{ borderColor: "var(--line)" }}>
          <div className="text-3xl mb-2">🏟</div>
          <div className="font-medium mb-1">No turfs listed yet</div>
          <div className="text-sm" style={{ color: "var(--ink-soft)" }}>Add your first turf above — it takes under a minute.</div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {/* min-w-0 on each card lets the grid item shrink below its content width;
              without it the card keeps its intrinsic width and truncate never fires. */}
          {turfs.map((t) => (
            <Link
              key={t.id}
              href={`/owner/turf/${t.id}`}
              className="bg-white rounded-xl border p-5 flex items-center gap-4 min-w-0 hover:shadow-md transition-shadow"
              style={{ borderColor: "var(--line)" }}
            >
              <div className="text-3xl shrink-0">{t.photo_emoji}</div>
              <div className="flex-1 min-w-0">
                {/* Wraps rather than truncates — an owner needs to read the whole
                    turf name and price to know which one they are opening. */}
                <div className="font-semibold text-lg leading-snug">{t.name}</div>
                <div className="text-base" style={{ color: "var(--ink-soft)" }}>{t.locality} · ₹{t.price_per_hour}/hr</div>
                <div className="text-base font-semibold mt-0.5" style={{ color: "var(--turf-dark)" }}>
                  Today: ₹{todayTotals[t.id] ?? 0}
                </div>
              </div>
              <div className="text-base font-semibold whitespace-nowrap" style={{ color: "var(--turf-dark)" }}>Bookings →</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
