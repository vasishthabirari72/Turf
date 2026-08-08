"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import Link from "next/link";

interface Slot {
  time: string;
  status: "open" | "app_booking" | "manual_block";
  note: string | null;
  customer_name: string | null;
}
interface Turf {
  id: number;
  name: string;
  locality: string;
  sport: string;
  price_per_hour: number;
  photo_emoji: string;
}

// Every slot state in one place, so the legend swatches and the real tiles can
// never drift apart — the legend is only trustworthy if it looks identical to
// what's in the grid.
const SLOT_STYLES = {
  open: { bg: "white", border: "var(--line)", text: "var(--ink)" },
  app_booking: { bg: "var(--booked-bg)", border: "var(--danger)", text: "var(--danger)" },
  manual_block: { bg: "var(--manual-bg)", border: "var(--amber)", text: "#8a5a00" },
} as const;

const LEGEND = [
  { key: "open", label: "Open", hint: "players can book it" },
  { key: "app_booking", label: "Booked", hint: "a player booked it on the app" },
  { key: "manual_block", label: "Blocked", hint: "you kept it for a phone booking" },
] as const;

function fmt(d: Date) {
  return d.toISOString().split("T")[0];
}
function dayLabel(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return { date: fmt(d), label: offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) };
}

export default function OwnerTurfCalendar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [turf, setTurf] = useState<Turf | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const { date } = dayLabel(dayOffset);

  // Mid-phone-call shortcut: snap to today and put the grid under the owner's
  // thumb, so blocking a slot is two taps from opening the app.
  function jumpToTodayGrid() {
    setDayOffset(0);
    setHighlight(true);
    // Wait for the day switch to paint before measuring the scroll target.
    requestAnimationFrame(() => {
      gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(false), 2200);
    return () => clearTimeout(t);
  }, [highlight]);

  const loadSlots = useCallback(() => {
    fetch(`/api/slots?turf_id=${id}&date=${date}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots || []));
  }, [id, date]);

  useEffect(() => {
    fetch(`/api/turfs/${id}`).then((r) => r.json()).then(setTurf);
  }, [id]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  async function toggleSlot(slot: Slot) {
    if (slot.status === "app_booking") return; // can't manually toggle real bookings here
    setBusy(slot.time);
    const action = slot.status === "open" ? "block" : "unblock";
    const res = await fetch("/api/slots/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turf_id: id, date, start_time: slot.time, action, note: "Phone / walk-in booking" }),
    });
    if (res.ok) loadSlots();
    setBusy(null);
  }

  // Mirrors the loaded layout (header, quick action, day tabs, legend, grid).
  if (!turf) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8" aria-busy="true" aria-label="Loading turf">
        <div className="skeleton h-4 w-28" />
        <div className="flex items-center gap-3 mt-4 mb-6">
          <div className="skeleton w-12 h-12 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="skeleton h-7 w-2/3" />
            <div className="skeleton h-4 w-1/2 mt-2" />
          </div>
        </div>
        <div className="skeleton h-14 w-full rounded-xl mb-5" />
        <div className="flex gap-2 mb-5">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-11 w-24 shrink-0" />)}
        </div>
        <div className="skeleton h-40 w-full rounded-xl mb-5" />
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          {Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton h-19" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link
        href="/owner"
        className="tap-target inline-flex items-center text-base font-semibold -ml-1 px-1"
        style={{ color: "var(--turf-dark)" }}
      >
        ← All my turfs
      </Link>

      <div className="flex items-center gap-3 mt-3 mb-6">
        <div className="text-3xl">{turf.photo_emoji}</div>
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--pitch)" }}>{turf.name}</h1>
          <div className="text-sm" style={{ color: "var(--ink-soft)" }}>{turf.locality} · ₹{turf.price_per_hour}/hr</div>
        </div>
      </div>

      <button
        type="button"
        onClick={jumpToTodayGrid}
        className="tap-target w-full mb-5 px-5 py-3.5 rounded-xl font-semibold text-left flex items-center gap-3 active:opacity-90"
        style={{ background: "var(--amber)", color: "var(--pitch)" }}
      >
        <span className="text-xl leading-none">📞</span>
        <span>Just got a call — block a slot now.</span>
      </button>

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {[0, 1, 2, 3, 4].map((o) => {
          const { label } = dayLabel(o);
          const active = o === dayOffset;
          return (
            <button
              key={o}
              onClick={() => setDayOffset(o)}
              className="tap-target px-5 py-2.5 rounded-lg text-base font-semibold whitespace-nowrap border"
              style={
                active
                  ? { background: "var(--pitch)", color: "white", borderColor: "var(--pitch)" }
                  : { background: "white", borderColor: "var(--line)", color: "var(--ink)" }
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Swatches are drawn from SLOT_STYLES, so each one is a miniature of the
          real tile rather than a differently-coloured dot. */}
      <div className="mb-5 rounded-xl p-4 flex flex-col gap-3" style={{ background: "white", border: "1px solid var(--line)" }}>
        <div className="font-semibold text-base" style={{ color: "var(--pitch)" }}>What the colours mean</div>
        {LEGEND.map((item) => {
          const s = SLOT_STYLES[item.key];
          return (
            <div key={item.key} className="flex items-center gap-3">
              <span
                className="w-12 h-11 rounded-lg border-2 shrink-0"
                style={{ background: s.bg, borderColor: s.border }}
              />
              <span className="text-base leading-snug">
                <strong style={{ color: s.text }}>{item.label}</strong>
                <span style={{ color: "var(--ink-soft)" }}> — {item.hint}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* scroll-mt clears the sticky 64px header when we jump here. */}
      <div
        ref={gridRef}
        className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 scroll-mt-24 rounded-xl transition-shadow duration-300"
        style={{ boxShadow: highlight ? "0 0 0 4px var(--amber)" : "0 0 0 0 rgba(0,0,0,0)" }}
      >
        {slots.map((slot) => {
          const isBusy = busy === slot.time;
          const { bg, border, text } = SLOT_STYLES[slot.status];

          return (
            <button
              key={slot.time}
              disabled={slot.status === "app_booking" || isBusy}
              onClick={() => toggleSlot(slot)}
              className="rounded-lg border-2 px-2.5 py-3 min-h-19 text-left transition-opacity disabled:cursor-not-allowed flex flex-col justify-center"
              style={{ background: bg, borderColor: border, opacity: isBusy ? 0.5 : 1 }}
              title={
                slot.status === "app_booking"
                  ? `Booked on the app by ${slot.customer_name}`
                  : slot.status === "manual_block"
                  ? "Tap to open this time again"
                  : "Tap to block this time"
              }
            >
              <div className="font-bold text-base" style={{ color: text }}>{slot.time}</div>
              <div className="text-sm font-semibold leading-tight" style={{ color: text }}>
                {slot.status === "app_booking" ? "Booked" : slot.status === "manual_block" ? "Blocked" : "Open"}
              </div>
              {/* Says what a tap does — there are no hover tooltips on a phone. */}
              <div className="text-xs leading-tight truncate" style={{ color: text, opacity: 0.75 }}>
                {slot.status === "app_booking"
                  ? slot.customer_name
                  : slot.status === "manual_block"
                  ? "Tap to open"
                  : "Tap to block"}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-lg p-4 text-base leading-relaxed" style={{ background: "white", border: "1px solid var(--line)", color: "var(--ink-soft)" }}>
        <strong style={{ color: "var(--ink)" }}>Booking by phone?</strong> Tap that time to block it, so nobody
        books it on the app. Tap it again to open it back up.
      </div>
    </div>
  );
}
