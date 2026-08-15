"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/useSession";
import { includesName, sameName } from "@/lib/names";

interface Contact {
  name: string;
  phone: string | null;
}

interface PlayerRequest {
  id: number;
  creator_name: string;
  sport: string;
  locality: string;
  date: string;
  time: string;
  players_needed: number;
  players_joined: string[];
  pending_joiners: string[];
  status: "open" | "full";
}

const SPORTS = ["Cricket", "Football", "Badminton", "Basketball", "Tennis"];
const LOCALITIES = ["Andheri West", "Andheri East", "Jogeshwari", "Goregaon", "Bandra"];

function formatDate(d: string) {
  const today = new Date().toISOString().split("T")[0];
  const tmrw = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  if (d === today) return "Today";
  if (d === tmrw) return "Tomorrow";
  return new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export default function FindPlayers() {
  // Your name is whoever the session says you are. It used to be a free-text
  // box saved to localStorage, which meant anyone could post or join as anyone.
  const { me } = useMe();
  const name = me?.name ?? "";
  const [requests, setRequests] = useState<PlayerRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [respondingKey, setRespondingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Contacts, per game, fetched on demand. Not folded into the games list
  // because that list is public and these numbers are not.
  const [contacts, setContacts] = useState<Record<number, Contact[] | "loading" | "error">>({});

  function load() {
    // Without this flag the empty state renders while the fetch is still in
    // flight, telling people there are no games when there may be plenty.
    fetch("/api/requests")
      .then((r) => r.json())
      .then((data) => {
        setRequests(data);
        setLoading(false);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    // creator_name is not sent: the server records the session's name.
    const payload = {
      sport: form.get("sport"),
      locality: form.get("locality"),
      date: form.get("date"),
      time: form.get("time"),
      players_needed: Number(form.get("players_needed")),
    };
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setShowForm(false);
      load();
    } else {
      const data = await res.json().catch(() => null);
      setToast(data?.error || "Could not post that game.");
    }
  }

  async function loadContacts(reqId: number) {
    setContacts((c) => ({ ...c, [reqId]: "loading" }));
    try {
      const r = await fetch(`/api/requests/${reqId}/contacts`, { cache: "no-store" });
      const d = await r.json().catch(() => null);
      setContacts((c) => ({ ...c, [reqId]: r.ok ? (d.contacts ?? []) : "error" }));
    } catch {
      setContacts((c) => ({ ...c, [reqId]: "error" }));
    }
  }

  async function handleJoin(req: PlayerRequest) {
    if (!name) {
      setToast("Please sign in first, then tap Request to join again.");
      return;
    }
    setJoiningId(req.id);
    const res = await fetch(`/api/requests/${req.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok) {
      setToast(data.error);
    } else {
      setToast(`Request sent to ${req.creator_name}. You're in once they approve.`);
      load();
    }
    setJoiningId(null);
  }

  async function handleRespond(req: PlayerRequest, player: string, action: "approve" | "reject") {
    setRespondingKey(`${req.id}:${player}`);
    const res = await fetch(`/api/requests/${req.id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_name: player, action }),
    });
    const data = await res.json();
    if (!res.ok) {
      setToast(data.error);
    } else {
      setToast(action === "approve" ? `${player} is in.` : `Turned down ${player}.`);
      load();
    }
    setRespondingKey(null);
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-2">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ color: "var(--pitch)" }}>Find players</h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Short a few players? Post it. Looking for a game? Join one.</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="tap-target px-5 py-2.5 rounded-lg font-semibold text-white whitespace-nowrap"
          style={{ background: "var(--amber)", color: "var(--pitch)" }}
        >
          {showForm ? "Cancel" : "+ Post a request"}
        </button>
      </div>

      {/* Not a text box any more: you act as the account you signed in with, so
          a game cannot be posted or joined in someone else's name. */}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>
          You are
        </span>
        {name ? (
          <>
            <span
              id="player-name"
              className="text-sm font-semibold rounded-lg px-3 py-2"
              style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
            >
              {name}
            </span>
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
              Approve requests on games you posted.
            </span>
          </>
        ) : (
          <Link
            href="/login?next=/players"
            className="tap-target text-sm font-semibold underline"
            style={{ color: "var(--turf-dark)" }}
          >
            Sign in to post or join a game
          </Link>
        )}
      </div>

      {toast && (
        <div className="mt-4 rounded-lg p-3 text-sm flex items-center justify-between" style={{ background: "#EAF6EB", border: "1px solid var(--turf)" }}>
          {toast}
          <button onClick={() => setToast(null)} className="text-xs font-semibold ml-3">✕</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border p-5 mt-5 grid sm:grid-cols-2 gap-4" style={{ borderColor: "var(--line)" }}>
          {/* The game is posted under the signed-in account, so there is
              nothing to type or get wrong here. */}
          <div className="sm:col-span-2">
            <div className="text-sm font-medium block mb-1">Posting as</div>
            <div className="w-full border rounded-lg px-3 py-2.5 font-semibold" style={{ borderColor: "var(--line)", background: "var(--paper)" }}>
              {name}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Sport</label>
            <select name="sport" required className="tap-target w-full border rounded-lg px-3 py-2.5" style={{ borderColor: "var(--line)" }}>
              {SPORTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Locality</label>
            <select name="locality" required className="tap-target w-full border rounded-lg px-3 py-2.5" style={{ borderColor: "var(--line)" }}>
              {LOCALITIES.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Date</label>
            <input name="date" type="date" required min={today} defaultValue={today} className="tap-target w-full border rounded-lg px-3 py-2.5" style={{ borderColor: "var(--line)" }} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Time</label>
            <input name="time" type="time" required defaultValue="18:00" className="tap-target w-full border rounded-lg px-3 py-2.5" style={{ borderColor: "var(--line)" }} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium block mb-1">Players needed</label>
            <input name="players_needed" type="number" required min={1} max={20} defaultValue={2} className="tap-target w-full border rounded-lg px-3 py-2.5 sm:w-40" style={{ borderColor: "var(--line)" }} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="tap-target px-5 py-2.5 rounded-lg font-semibold text-white" style={{ background: "var(--pitch)" }}>
              Post request
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {loading ? (
          <div aria-busy="true" aria-label="Loading requests" className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl border p-5 flex items-center justify-between gap-4" style={{ borderColor: "var(--line)" }}>
                <div className="flex-1 min-w-0">
                  <div className="skeleton h-5 w-2/3" />
                  <div className="skeleton h-4 w-1/2 mt-2" />
                </div>
                <div className="skeleton h-10 w-28 rounded-lg shrink-0" />
              </div>
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16 rounded-xl border-2 border-dashed" style={{ borderColor: "var(--line)" }}>
            <div className="text-3xl mb-2">🤝</div>
            <div className="font-medium">New here — be the first to post a game!</div>
            <div className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>Post one and players nearby can ask to join.</div>
          </div>
        ) : (
          requests.map((req) => {
            const spotsLeft = req.players_needed - req.players_joined.length;
            const full = req.status === "full";
            const me = name;
            // Matched the same way the API matches them, so retyping your name
            // with different capitalisation doesn't hide your own approval panel
            // or offer you a join button you'd only get rejected for.
            const isCreator = me !== "" && sameName(req.creator_name, me);
            const isJoined = me !== "" && includesName(req.players_joined, me);
            const isPending = me !== "" && includesName(req.pending_joiners, me);
            return (
              <div key={req.id} className="bg-white rounded-xl border p-5 flex items-start justify-between gap-4 flex-wrap" style={{ borderColor: "var(--line)" }}>
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{req.creator_name}</span>
                    <span className="text-sm" style={{ color: "var(--ink-soft)" }}>needs {req.players_needed} for {req.sport.toLowerCase()}</span>
                  </div>
                  <div className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
                    📍 {req.locality} · 🗓 {formatDate(req.date)} at {req.time}
                  </div>
                  {req.players_joined.length > 0 && (
                    <div className="text-xs mt-1.5" style={{ color: "var(--turf-dark)" }}>
                      Joined: {req.players_joined.join(", ")}
                    </div>
                  )}

                  {/* The point of approving someone: a way to actually reach
                      them. Only shown to people in the game, and only once
                      approval has happened — the server enforces both. */}
                  {((isCreator && req.players_joined.length > 0) || isJoined) && (
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--line)" }}>
                      {contacts[req.id] === undefined ? (
                        <button
                          type="button"
                          onClick={() => loadContacts(req.id)}
                          className="tap-target text-sm font-semibold underline -ml-1 px-1"
                          style={{ color: "var(--turf-dark)" }}
                        >
                          {isCreator ? "Show players' numbers" : `Show ${req.creator_name}'s number`}
                        </button>
                      ) : contacts[req.id] === "loading" ? (
                        <div className="text-sm" style={{ color: "var(--ink-soft)" }}>Loading…</div>
                      ) : contacts[req.id] === "error" ? (
                        <div className="text-sm" style={{ color: "var(--danger)" }}>
                          Couldn&apos;t load contact details.{" "}
                          <button type="button" onClick={() => loadContacts(req.id)} className="underline font-semibold">
                            Try again
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <div className="text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
                            {isCreator ? "Who's playing" : "Organiser"}
                          </div>
                          {(contacts[req.id] as Contact[]).map((c) => (
                            <div key={c.name} className="flex items-center justify-between gap-3 text-sm">
                              <span className="font-medium">{c.name}</span>
                              {c.phone ? (
                                // tel: so a tap dials straight from a phone.
                                <a
                                  href={`tel:${c.phone.replace(/\s+/g, "")}`}
                                  className="tap-target font-semibold whitespace-nowrap"
                                  style={{ color: "var(--turf-dark)" }}
                                >
                                  📞 {c.phone}
                                </a>
                              ) : (
                                <span className="text-xs whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>
                                  no number saved
                                </span>
                              )}
                            </div>
                          ))}
                          {(contacts[req.id] as Contact[]).some((c) => !c.phone) && (
                            <div className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
                              Anyone without a number can add one on their{" "}
                              <Link href="/profile" className="underline font-medium" style={{ color: "var(--turf-dark)" }}>
                                profile
                              </Link>
                              .
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {isCreator && req.pending_joiners.length > 0 && (
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--line)" }}>
                      <div className="text-xs font-semibold mb-2" style={{ color: "var(--ink-soft)" }}>
                        Waiting on you ({req.pending_joiners.length})
                      </div>
                      <div className="flex flex-col gap-2">
                        {req.pending_joiners.map((p) => {
                          const busy = respondingKey === `${req.id}:${p}`;
                          return (
                            <div key={p} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "var(--manual-bg)" }}>
                              <span className="text-sm font-medium">{p}</span>
                              <div className="flex gap-2">
                                <button
                                  disabled={busy}
                                  onClick={() => handleRespond(req, p, "approve")}
                                  className="tap-target px-3 py-1.5 rounded-lg font-semibold text-xs whitespace-nowrap disabled:opacity-60"
                                  style={{ background: "var(--turf)", color: "white" }}
                                >
                                  Approve
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() => handleRespond(req, p, "reject")}
                                  className="tap-target px-3 py-1.5 rounded-lg font-semibold text-xs whitespace-nowrap border disabled:opacity-60"
                                  style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--paper)" }}
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {isCreator ? (
                  <span className="text-sm font-medium whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>
                    Your game
                  </span>
                ) : isJoined ? (
                  <span className="tap-target px-4 py-2 rounded-lg font-semibold text-sm whitespace-nowrap" style={{ background: "#EAF6EB", color: "var(--turf-dark)" }}>
                    Joined ✓
                  </span>
                ) : isPending ? (
                  <span className="tap-target px-4 py-2 rounded-lg font-semibold text-sm whitespace-nowrap" style={{ background: "var(--manual-bg)", color: "var(--pitch)" }}>
                    Requested
                  </span>
                ) : (
                  <button
                    disabled={full || joiningId === req.id}
                    onClick={() => handleJoin(req)}
                    className="tap-target px-4 py-2 rounded-lg font-semibold text-sm whitespace-nowrap disabled:opacity-60"
                    style={full ? { background: "var(--line)", color: "var(--ink-soft)" } : { background: "var(--turf)", color: "white" }}
                  >
                    {full ? "Full" : joiningId === req.id ? "Sending…" : `Request to join (${spotsLeft} left)`}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
