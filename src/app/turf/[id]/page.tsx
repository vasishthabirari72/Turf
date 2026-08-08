"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";

interface Slot {
  time: string;
  status: "open" | "app_booking" | "manual_block";
}
interface Turf {
  id: number;
  name: string;
  owner_name: string;
  locality: string;
  sport: string;
  price_per_hour: number;
  photo_emoji: string;
  rating: number;
}

// ---------------------------------------------------------------------------
// MOCK PAYMENT — there is no gateway here and no payment provider is contacted.
// The card fields are cosmetic: nothing is validated, stored, or transmitted,
// and the "Pay" button just waits on a setTimeout before calling our own
// /api/bookings. The booking API remains the only source of truth for whether
// a slot was taken.
//
// TODO: integrate a real gateway (Razorpay/Stripe) before taking real money.
// That work replaces `handlePay`'s setTimeout with a real order + checkout
// round-trip, and must move slot creation server-side behind a verified
// payment webhook — a client-side success callback must never be trusted.
// ---------------------------------------------------------------------------

// Cosmetic only — groups digits so the field reads like a card number.
function formatCardNumber(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}
function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

function fmt(d: Date) {
  return d.toISOString().split("T")[0];
}
function dayLabel(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return { date: fmt(d), label: offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) };
}

export default function TurfDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [turf, setTurf] = useState<Turf | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Step 2 of the booking flow — the mock payment sheet.
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [card, setCard] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardError, setCardError] = useState<string | null>(null);

  const { date } = dayLabel(dayOffset);

  const loadSlots = useCallback(() => {
    fetch(`/api/slots?turf_id=${id}&date=${date}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots || []));
  }, [id, date]);

  useEffect(() => {
    fetch(`/api/turfs/${id}`).then((r) => r.json()).then(setTurf);
    const saved = localStorage.getItem("player_name");
    if (saved) setName(saved);
  }, [id]);

  useEffect(() => {
    loadSlots();
    setSelected(null);
    setConfirmed(null);
    setError(null);
  }, [loadSlots]);

  // Step 1 → 2. Nothing is charged or reserved here; it only opens the sheet.
  function handleContinueToPayment() {
    if (!selected || !name.trim()) return;
    localStorage.setItem("player_name", name.trim());
    setError(null);
    setCardError(null);
    setPayOpen(true);
  }

  // Step 2. The delay below is a stand-in for a gateway round-trip so the demo
  // feels real — see the MOCK PAYMENT note at the top of this file. The actual
  // booking is still decided by /api/bookings, not by anything on this screen.
  async function handlePay() {
    if (!selected || !name.trim()) return;

    // Presence check only — still no real card validation (see MOCK PAYMENT above).
    if (!card.trim() || !expiry.trim() || !cvv.trim()) {
      setCardError("Please enter card details");
      return;
    }

    setCardError(null);
    setPaying(true);
    setError(null);

    await new Promise((resolve) => setTimeout(resolve, 900));

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turf_id: id, date, start_time: selected, customer_name: name.trim() }),
    });
    const data = await res.json();
    setPaying(false);
    setPayOpen(false);

    if (!res.ok) {
      // Someone else took the slot while the sheet was open — surface the real
      // reason rather than pretending the payment went through.
      setError(data.error || "Something went wrong. Please try again.");
      loadSlots();
    } else {
      setConfirmed(selected);
      setSelected(null);
      setCard("");
      setExpiry("");
      setCvv("");
      // Without this the grid keeps showing the slot as available, and tapping
      // it again reports "just taken" against the booking you just made.
      loadSlots();
    }
  }

  // Skeleton mirrors the loaded layout (header, day tabs, slot grid) so the page
  // settles into place instead of flashing bare text.
  if (!turf) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8" aria-busy="true" aria-label="Loading turf">
        <div className="skeleton h-4 w-32" />
        <div className="flex items-center gap-3 mt-4 mb-6">
          <div className="skeleton w-12 h-12 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="skeleton h-7 w-2/3" />
            <div className="skeleton h-4 w-1/2 mt-2" />
          </div>
        </div>
        <div className="flex gap-2 mb-5">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-11 w-24 shrink-0" />)}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          {Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton h-16" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/search" className="text-sm font-medium" style={{ color: "var(--turf-dark)" }}>← Back to search</Link>

      <div className="flex items-start justify-between mt-3 mb-6 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="text-3xl">{turf.photo_emoji}</div>
          <div>
            <h1 className="font-display text-2xl font-bold" style={{ color: "var(--pitch)" }}>{turf.name}</h1>
            <div className="text-sm" style={{ color: "var(--ink-soft)" }}>{turf.locality} · {turf.sport} · ★ {turf.rating.toFixed(1)}</div>
          </div>
        </div>
        <div className="font-display text-xl font-bold" style={{ color: "var(--turf-dark)" }}>₹{turf.price_per_hour}<span className="text-xs font-normal" style={{ color: "var(--ink-soft)" }}>/hr</span></div>
      </div>

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {[0, 1, 2, 3, 4].map((o) => {
          const { label } = dayLabel(o);
          const active = o === dayOffset;
          return (
            <button
              key={o}
              onClick={() => setDayOffset(o)}
              className="tap-target px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap border"
              style={active ? { background: "var(--pitch)", color: "white", borderColor: "var(--pitch)" } : { background: "white", borderColor: "var(--line)", color: "var(--ink)" }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {confirmed && (
        <div className="mb-5 rounded-lg p-4 flex items-start gap-3" style={{ background: "#EAF6EB", border: "1px solid var(--turf)" }}>
          <div className="text-xl">✅</div>
          <div>
            <div className="font-semibold" style={{ color: "var(--turf-dark)" }}>Slot booked for {confirmed}</div>
            <div className="text-sm" style={{ color: "var(--ink-soft)" }}>Short on players for this game? <Link href="/players" className="underline font-medium">Post a request</Link> to fill it out.</div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-lg p-4 text-sm" style={{ background: "var(--booked-bg)", border: "1px solid var(--danger)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 mb-6">
        {slots.map((slot) => {
          const unavailable = slot.status !== "open";
          const isSelected = selected === slot.time;
          return (
            <button
              key={slot.time}
              disabled={unavailable}
              onClick={() => setSelected(slot.time)}
              className="tap-target rounded-lg border-2 px-2 py-3 text-left disabled:cursor-not-allowed"
              style={
                unavailable
                  ? { background: "var(--booked-bg)", borderColor: "var(--line)", color: "var(--ink-soft)", opacity: 0.6 }
                  : isSelected
                  ? { background: "var(--turf)", borderColor: "var(--turf-dark)", color: "white" }
                  : { background: "white", borderColor: "var(--line)", color: "var(--ink)" }
              }
            >
              <div className="font-semibold text-sm">{slot.time}</div>
              <div className="text-[11px] mt-0.5 opacity-85">{unavailable ? "Booked" : isSelected ? "Selected" : "Available"}</div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="bg-white rounded-xl border p-5 sticky bottom-4" style={{ borderColor: "var(--line)" }}>
          <div className="text-sm font-medium mb-2">
            Booking <strong>{turf.name}</strong> on {date} at <strong>{selected}</strong> — ₹{turf.price_per_hour}
          </div>
          <div className="flex gap-2 flex-wrap">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="tap-target flex-1 min-w-40 border rounded-lg px-3 py-3 text-base"
              style={{ borderColor: "var(--line)" }}
            />
            <button
              onClick={handleContinueToPayment}
              disabled={!name.trim()}
              className="tap-target px-5 py-2.5 rounded-lg font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--turf)" }}
            >
              Continue to payment
            </button>
          </div>
        </div>
      )}

      {/* Step 2: mock payment sheet. Looks like a checkout; contacts no gateway.
          Rendered only while a slot is held in `selected`, so anything that
          clears the selection also dismisses this. */}
      {selected && payOpen && turf && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          style={{ background: "rgba(20, 32, 24, 0.55)" }}
          onClick={() => !paying && setPayOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Payment"
        >
          <div
            className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-full overflow-y-auto"
            style={{ background: "var(--paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="font-display text-lg font-bold" style={{ color: "var(--pitch)" }}>Payment</div>
              <button
                onClick={() => setPayOpen(false)}
                disabled={paying}
                aria-label="Close payment"
                className="tap-target px-3 rounded-lg text-lg disabled:opacity-40"
                style={{ color: "var(--ink-soft)" }}
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl p-4 mb-5" style={{ background: "var(--chalk)", border: "1px solid var(--line)" }}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm" style={{ color: "var(--ink-soft)" }}>Amount to pay</span>
                <span className="font-display text-2xl font-bold" style={{ color: "var(--pitch)" }}>₹{turf.price_per_hour}</span>
              </div>
              <div className="mt-2 pt-2 text-sm leading-relaxed" style={{ borderTop: "1px solid var(--line)", color: "var(--ink-soft)" }}>
                <div style={{ color: "var(--ink)" }}>{turf.name}</div>
                <div>{dayLabel(dayOffset).label}, {date} · {selected} · 1 hour</div>
              </div>
            </div>

            <label className="text-sm font-semibold block mb-1.5" htmlFor="card-number">Card number</label>
            <input
              id="card-number"
              value={card}
              onChange={(e) => { setCard(formatCardNumber(e.target.value)); setCardError(null); }}
              placeholder="1234 5678 9012 3456"
              inputMode="numeric"
              autoComplete="off"
              disabled={paying}
              className="tap-target w-full border rounded-lg px-3 py-3 text-base tracking-wider mb-3"
              style={{ borderColor: "var(--line)" }}
            />

            <div className="flex gap-3 mb-5">
              <div className="flex-1 min-w-0">
                <label className="text-sm font-semibold block mb-1.5" htmlFor="card-expiry">Expiry</label>
                <input
                  id="card-expiry"
                  value={expiry}
                  onChange={(e) => { setExpiry(formatExpiry(e.target.value)); setCardError(null); }}
                  placeholder="MM/YY"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={paying}
                  className="tap-target w-full border rounded-lg px-3 py-3 text-base"
                  style={{ borderColor: "var(--line)" }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-sm font-semibold block mb-1.5" htmlFor="card-cvv">CVV</label>
                <input
                  id="card-cvv"
                  value={cvv}
                  onChange={(e) => { setCvv(e.target.value.replace(/\D/g, "").slice(0, 3)); setCardError(null); }}
                  placeholder="123"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={paying}
                  className="tap-target w-full border rounded-lg px-3 py-3 text-base"
                  style={{ borderColor: "var(--line)" }}
                />
              </div>
            </div>

            {cardError && (
              <div
                role="alert"
                className="mb-3 rounded-lg px-3 py-2.5 text-sm font-medium"
                style={{ background: "var(--booked-bg)", border: "1px solid var(--danger)", color: "var(--danger)" }}
              >
                {cardError}
              </div>
            )}

            <button
              onClick={handlePay}
              disabled={paying}
              className="tap-target w-full px-5 py-3.5 rounded-lg text-base font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-80"
              style={{ background: "var(--turf)" }}
            >
              {paying ? (
                <>
                  <span
                    className="inline-block w-4 h-4 rounded-full animate-spin"
                    style={{ border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "white" }}
                  />
                  Processing…
                </>
              ) : (
                `Pay ₹${turf.price_per_hour}`
              )}
            </button>

            <div className="text-xs text-center mt-3" style={{ color: "var(--ink-soft)" }}>
              Demo only — no real payment is taken and no card details are stored.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
