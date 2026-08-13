"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import Link from "next/link";
import { sameName } from "@/lib/names";

interface Slot {
  time: string;
  status: "open" | "app_booking" | "manual_block";
  note: string | null;
  customer_name: string | null;
  // 'card' | 'upi' | 'cod', or null for manual blocks and older bookings.
  payment_method: string | null;
  price: number;
}

interface PricingRule {
  id: number;
  turf_id: number;
  start_time: string;
  end_time: string;
  price: number;
}

const CASH = "💵";
interface Turf {
  id: number;
  name: string;
  owner_name: string;
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

// `style` picks the swatch colours from SLOT_STYLES; `key` is just the React key,
// since paid and cash bookings deliberately share the same colours.
const LEGEND = [
  { key: "open", style: "open", label: "Open", hint: "players can book it" },
  { key: "paid", style: "app_booking", label: "Booked", hint: "already paid online" },
  { key: "cash", style: "app_booking", label: `Booked ${CASH}`, hint: "collect the cash at the turf" },
  { key: "blocked", style: "manual_block", label: "Blocked", hint: "you kept it for a phone booking" },
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
  // null while we read localStorage; "" means nobody is signed in.
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [ruleBusy, setRuleBusy] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  // Slot awaiting a "how much did you take?" answer before it is blocked.
  const [blocking, setBlocking] = useState<Slot | null>(null);
  const [amount, setAmount] = useState("");

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
    const saved = localStorage.getItem("owner_name") || "";
    // Both land together, so there's no render where the turf is known but the
    // signed-in owner isn't (which would briefly fail the ownership check).
    fetch(`/api/turfs/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setTurf(data);
        setOwnerName(saved);
      });
  }, [id]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const loadRules = useCallback(() => {
    fetch(`/api/pricing?turf_id=${id}`)
      .then((r) => r.json())
      .then((data) => setRules(Array.isArray(data) ? data : []));
  }, [id]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  async function addRule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Captured before the await — currentTarget is not reliable afterwards.
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setRuleBusy(true);
    setRuleError(null);
    const res = await fetch("/api/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        turf_id: Number(id),
        start_time: form.get("start_time"),
        end_time: form.get("end_time"),
        price: Number(form.get("price")),
        acting_as: ownerName ?? "",
      }),
    });
    const data = await res.json();
    setRuleBusy(false);
    if (!res.ok) {
      setRuleError(data.error || "Could not save that price.");
      return;
    }
    formEl.reset();
    loadRules();
    loadSlots(); // the grid prices change immediately
  }

  async function deleteRule(ruleId: number) {
    setRuleBusy(true);
    setRuleError(null);
    const res = await fetch(`/api/pricing/${ruleId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acting_as: ownerName ?? "" }),
    });
    setRuleBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setRuleError(data.error || "Could not remove that price.");
      return;
    }
    loadRules();
    loadSlots();
  }

  async function toggleSlot(slot: Slot) {
    if (slot.status === "app_booking") return; // can't manually toggle real bookings here

    // Releasing a slot is still a single tap. Blocking one asks how much was
    // taken first, so a phone booking lands in the ledger instead of vanishing.
    if (slot.status === "open") {
      setAmount("");
      setBlocking(slot);
      return;
    }

    setBusy(slot.time);
    const res = await fetch("/api/slots/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        turf_id: id,
        date,
        start_time: slot.time,
        action: "unblock",
        acting_as: ownerName ?? "",
      }),
    });
    if (res.ok) loadSlots();
    setBusy(null);
  }

  async function confirmBlock(e: React.FormEvent) {
    e.preventDefault();
    const slot = blocking;
    if (!slot) return;
    setBusy(slot.time);
    const res = await fetch("/api/slots/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        turf_id: id,
        date,
        start_time: slot.time,
        action: "block",
        note: "Phone / walk-in booking",
        acting_as: ownerName ?? "",
        // Blank stays blank — a slot blocked for maintenance has no money on it.
        amount: amount.trim() === "" ? null : amount.trim(),
      }),
    });
    setBlocking(null);
    setAmount("");
    if (res.ok) loadSlots();
    setBusy(null);
  }

  // Waits on ownerName too, so another owner's calendar never flashes up before
  // the check below runs.
  if (!turf || ownerName === null) {
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

  const cashSlots = slots.filter((s) => s.status === "app_booking" && s.payment_method === "cod");
  // Summed from each booking's own price, not count x flat rate — peak slots
  // cost more, and the owner is collecting the real amounts.
  const cashTotal = cashSlots.reduce((sum, s) => sum + s.price, 0);

  // The API enforces this too; this just avoids showing someone a calendar whose
  // controls would all be rejected.
  if (!sameName(turf.owner_name, ownerName)) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center py-16 rounded-xl border-2 border-dashed" style={{ borderColor: "var(--line)" }}>
          <div className="text-3xl mb-2">🔒</div>
          <div className="font-medium text-base">This turf belongs to someone else</div>
          <div className="text-base mt-1" style={{ color: "var(--ink-soft)" }}>
            {ownerName
              ? `You are signed in as ${ownerName}. Only ${turf.owner_name} can manage this calendar.`
              : "Sign in as the owner of this turf to manage its calendar."}
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

      <Link
        href={`/owner/turf/${id}/revenue`}
        className="tap-target inline-flex items-center gap-2 mb-5 px-5 py-3 rounded-xl text-base font-semibold w-full"
        style={{ background: "var(--pitch)", color: "white" }}
      >
        <span aria-hidden="true">🧾</span>
        <span>Today&apos;s collection</span>
      </Link>

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
          const s = SLOT_STYLES[item.style];
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

      {/* Cash bookings are the only ones the owner still has to act on, so the
          day's total is worth stating outright rather than making them count
          tiles. Hidden entirely when there's nothing to collect. */}
      {cashSlots.length > 0 && (
        <div
          className="mb-5 rounded-xl p-4 text-base leading-relaxed"
          style={{ background: "var(--manual-bg)", border: "1px solid var(--amber)", color: "var(--ink)" }}
        >
          <strong>
            {CASH} ₹{cashTotal} to collect on this day
          </strong>{" "}
          — {cashSlots.length} booking{cashSlots.length > 1 ? "s" : ""} paying cash at the turf
          {" "}({cashSlots.map((s) => s.time).join(", ")}).
        </div>
      )}

      {/* scroll-mt clears the sticky 64px header when we jump here. */}
      <div
        ref={gridRef}
        className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 scroll-mt-24 rounded-xl transition-shadow duration-300"
        style={{ boxShadow: highlight ? "0 0 0 4px var(--amber)" : "0 0 0 0 rgba(0,0,0,0)" }}
      >
        {slots.map((slot) => {
          const isBusy = busy === slot.time;
          const { bg, border, text } = SLOT_STYLES[slot.status];
          const isCash = slot.status === "app_booking" && slot.payment_method === "cod";

          return (
            <button
              key={slot.time}
              disabled={slot.status === "app_booking" || isBusy}
              onClick={() => toggleSlot(slot)}
              className="rounded-lg border-2 px-2.5 py-3 min-h-19 text-left transition-opacity disabled:cursor-not-allowed flex flex-col justify-center"
              style={{ background: bg, borderColor: border, opacity: isBusy ? 0.5 : 1 }}
              title={
                slot.status === "app_booking"
                  ? `Booked on the app by ${slot.customer_name}${isCash ? " — paying cash at the turf" : ""}`
                  : slot.status === "manual_block"
                  ? "Tap to open this time again"
                  : "Tap to block this time"
              }
            >
              <div className="font-bold text-base" style={{ color: text }}>{slot.time}</div>
              <div className="text-sm font-semibold leading-tight" style={{ color: text }}>
                {slot.status === "app_booking" ? "Booked" : slot.status === "manual_block" ? "Blocked" : "Open"}
                {isCash && <span title="Cash to collect"> {CASH}</span>}
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

      {/* Pricing sits below the grid on purpose: it's set once in a while, while
          blocking a slot happens mid-phone-call and must stay at the top. */}
      <div className="mt-6 rounded-xl p-4 sm:p-5" style={{ background: "white", border: "1px solid var(--line)" }}>
        <div className="font-semibold text-base" style={{ color: "var(--pitch)" }}>Charge more at busy times</div>
        <div className="text-base mt-1 mb-4" style={{ color: "var(--ink-soft)" }}>
          Every hour costs ₹{turf.price_per_hour} unless you set a different price below.
        </div>

        {rules.length > 0 && (
          <div className="flex flex-col gap-2 mb-4">
            {rules.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
                style={{ background: "var(--manual-bg)" }}
              >
                <span className="text-base font-medium">
                  {r.start_time} – {r.end_time} · <strong>₹{r.price}</strong>/hr
                </span>
                <button
                  type="button"
                  onClick={() => deleteRule(r.id)}
                  disabled={ruleBusy}
                  aria-label={`Remove the ₹${r.price} price for ${r.start_time} to ${r.end_time}`}
                  className="tap-target px-3 py-1.5 rounded-lg text-sm font-semibold border whitespace-nowrap disabled:opacity-60"
                  style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--paper)" }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={addRule} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-sm font-semibold block mb-1.5" htmlFor="rule-start">From</label>
            <input
              id="rule-start" name="start_time" type="time" required defaultValue="18:00"
              disabled={ruleBusy}
              className="tap-target w-full border rounded-lg px-3 py-3 text-base"
              style={{ borderColor: "var(--line)" }}
            />
          </div>
          <div>
            <label className="text-sm font-semibold block mb-1.5" htmlFor="rule-end">To</label>
            <input
              id="rule-end" name="end_time" type="time" required defaultValue="22:00"
              disabled={ruleBusy}
              className="tap-target w-full border rounded-lg px-3 py-3 text-base"
              style={{ borderColor: "var(--line)" }}
            />
          </div>
          <div>
            <label className="text-sm font-semibold block mb-1.5" htmlFor="rule-price">Price (₹)</label>
            <input
              id="rule-price" name="price" type="number" required min={1} step={1} defaultValue={turf.price_per_hour + 200}
              disabled={ruleBusy}
              className="tap-target w-full border rounded-lg px-3 py-3 text-base"
              style={{ borderColor: "var(--line)" }}
            />
          </div>
          <button
            type="submit"
            disabled={ruleBusy}
            className="tap-target px-5 py-3 rounded-lg text-base font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--pitch)" }}
          >
            {ruleBusy ? "Saving…" : "Set price"}
          </button>
        </form>

        {ruleError && (
          <div
            role="alert"
            className="mt-3 rounded-lg px-3 py-2.5 text-base font-medium"
            style={{ background: "var(--booked-bg)", border: "1px solid var(--danger)", color: "var(--danger)" }}
          >
            {ruleError}
          </div>
        )}
      </div>

      {/* One field, one tap. This sits in the middle of a phone call, so the
          amount is optional and Enter confirms — nothing here should slow the
          owner down or refuse to proceed. */}
      {blocking && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          style={{ background: "rgba(20, 32, 24, 0.55)" }}
          onClick={() => setBlocking(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Block ${blocking.time}`}
        >
          <form
            onSubmit={confirmBlock}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5"
            style={{ background: "var(--paper)" }}
          >
            <div className="font-display text-lg font-bold" style={{ color: "var(--pitch)" }}>
              Block {blocking.time}
            </div>
            <div className="text-base mt-1 mb-4" style={{ color: "var(--ink-soft)" }}>
              {dayLabel(dayOffset).label} · nobody will be able to book this hour on the app.
            </div>

            <label className="text-base font-semibold block mb-1.5" htmlFor="block-amount">
              Amount collected <span style={{ color: "var(--ink-soft)" }}>(optional)</span>
            </label>
            <input
              id="block-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`e.g. ${blocking.price}`}
              inputMode="numeric"
              autoFocus
              className="tap-target w-full border rounded-lg px-3 py-3 text-base"
              style={{ borderColor: "var(--line)" }}
            />
            <div className="text-sm mt-2" style={{ color: "var(--ink-soft)" }}>
              Leave it blank if no money changed hands — for repairs or your own game.
            </div>

            <div className="flex gap-3 mt-5">
              <button
                type="submit"
                disabled={busy === blocking.time}
                className="tap-target flex-1 px-5 py-3 rounded-lg text-base font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--amber)", color: "var(--pitch)" }}
              >
                {busy === blocking.time ? "Blocking…" : "Block slot"}
              </button>
              <button
                type="button"
                onClick={() => setBlocking(null)}
                className="tap-target px-5 py-3 rounded-lg text-base font-semibold border"
                style={{ borderColor: "var(--line)", color: "var(--ink)", background: "var(--paper)" }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
