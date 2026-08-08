"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
  const [ownerName, setOwnerName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false); // form submit
  const [turfsLoading, setTurfsLoading] = useState(true); // initial turf list

  useEffect(() => {
    const saved = localStorage.getItem("owner_name");
    if (saved) {
      setOwnerName(saved);
      setNameInput(saved);
    }
  }, []);

  useEffect(() => {
    if (!ownerName) return;
    fetch(`/api/turfs?owner_name=${encodeURIComponent(ownerName)}`)
      .then((r) => r.json())
      .then((data) => {
        setTurfs(data);
        // Until this resolves the list is empty, which would otherwise render
        // "No turfs listed yet" to an owner who does have turfs.
        setTurfsLoading(false);
      });
  }, [ownerName]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!nameInput.trim()) return;
    localStorage.setItem("owner_name", nameInput.trim());
    setOwnerName(nameInput.trim());
  }

  async function handleAddTurf(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name"),
      owner_name: ownerName,
      locality: form.get("locality"),
      sport: form.get("sport"),
      price_per_hour: Number(form.get("price")),
      photo_emoji: form.get("sport") === "Cricket" ? "🏏" : form.get("sport") === "Badminton" ? "🏸" : "⚽",
    };
    const res = await fetch("/api/turfs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const newTurf = await res.json();
    setTurfs((prev) => [newTurf, ...prev]);
    setShowForm(false);
    setLoading(false);
  }

  if (!ownerName) {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 py-16">
        <h1 className="font-display text-2xl font-bold mb-2" style={{ color: "var(--pitch)" }}>
          Owner sign in
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
          Just type your name. No password needed.
        </p>
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            className="tap-target border rounded-lg px-4 py-3.5 text-base"
            style={{ borderColor: "var(--line)" }}
            placeholder="Your name (e.g. Ramesh Patil)"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            className="tap-target rounded-lg px-4 py-3.5 text-base font-semibold text-white"
            style={{ background: "var(--pitch)" }}
          >
            Continue
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
        <div>
          <div className="text-sm" style={{ color: "var(--ink-soft)" }}>Welcome back,</div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--pitch)" }}>{ownerName}</h1>
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
              </div>
              <div className="text-base font-semibold whitespace-nowrap" style={{ color: "var(--turf-dark)" }}>Bookings →</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
