# MaidaanConnect — Localhost Demo

A working demo of a turf booking + player-matchmaking platform, built to show turf owners
in person before investing in a full production build.

## What's in this demo

- **Owner side**: sign in with just a name, list a turf in under a minute, see a day-by-day
  slot calendar, and mark any slot unavailable with one tap (for phone/walk-in bookings) —
  this is the feature that keeps the app in sync with how owners already take bookings.
  A "Just got a call" shortcut jumps straight to today's grid, so blocking a slot mid-call
  is two taps from opening the app.
- **Consumer side**: search turfs by locality and sport, see live slot availability, and
  book through a two-step checkout — pick a slot, then a payment sheet with amount, card
  fields, and a "Pay ₹X" button. The payment is entirely mocked: no gateway, no card
  validation, no money moves.
- **Find Players**: post a request for players, browse open requests near you, and ask to
  join one. Joining is request-then-approve — you show as "Requested" until the person who
  posted the game approves you, and they get Approve/Reject buttons on their own post.

Pre-seeded with 5 fake turfs, some fake bookings, and a couple of open player requests —
so it doesn't look empty when you demo it.

## How to run it

```bash
npm install
npm run dev
```

Then open **http://localhost:3000** in your browser.

First run will create a `turf.db` SQLite file and seed it automatically. Delete `turf.db`
(and the `-shm`/`-wal` files next to it) any time to reset back to the seed data.

## What's intentionally NOT built (by design, for speed)

- Real payments (Razorpay/UPI) — the checkout is a visual mock. See the MOCK PAYMENT note
  at the top of `src/app/turf/[id]/page.tsx`: a real integration must move slot creation
  server-side behind a verified payment webhook, because a client-side success callback
  can't be trusted.
- OTP/SMS login — just a name field. Identity is a self-declared name held in
  `localStorage`, so ownership and approval checks (`acting_as`) stop honest mistakes and
  casual API pokes, but not deliberate spoofing by someone who types the right name.
- Real maps/geolocation — locality is a dropdown, not GPS
- Push notifications
- Mobile app — this is a responsive website, works fine on a phone browser for demo purposes

These get added once you've validated real demand with owners (see the roadmap docs for
what production would add).

## Deploying this somewhere

It won't run on Vercel or any other serverless host as-is. `src/lib/db.ts` opens a local
SQLite file with `node:sqlite` and creates/seeds tables on first import — serverless
filesystems are read-only apart from an ephemeral `/tmp`, so writes fail and no two
requests share state. To put it on the internet you need either a host with a persistent
disk (Railway, Render, Fly with a volume) or a hosted database (Turso/libSQL is the
smallest change from here; Neon or Supabase if you'd rather move to Postgres).

## Project structure

```
src/app/
  page.tsx                  → home page
  search/page.tsx           → consumer: search turfs
  turf/[id]/page.tsx        → consumer: turf detail + book a slot
  players/page.tsx          → find players: post/browse/join requests
  owner/page.tsx            → owner: sign in + list of my turfs + add turf
  owner/turf/[id]/page.tsx  → owner: calendar + one-tap block/unblock slots
  api/                      → backend routes (turfs, slots, bookings, requests)
src/lib/db.ts               → SQLite schema, seed data, unique-constraint helper
src/lib/names.ts            → case/whitespace-insensitive name matching, shared by
                              the API routes and the UI so both agree on identity
```

## Two things worth knowing before you change anything

**Double-booking is prevented by the database, not the application.** There's a unique
index on `slot_overrides(turf_id, date, start_time)`. The routes still do a fast
check-before-insert, but that alone leaves a race window between the SELECT and the
INSERT; the index is what actually closes it, and the routes catch the constraint
violation and return a clean 409. Don't drop the index and rely on the pre-check.

**Names are compared loosely and stored as typed.** Anywhere a name decides something —
who may approve a join request, who owns a turf — comparison goes through
`sameName`/`includesName` in `src/lib/names.ts`, so "Ramesh Patil", "ramesh patil" and
" Ramesh Patil " are the same person. Names are stored with the capitalisation the user
typed. Comparing with `===` anywhere reintroduces the bug where retyping your own name
locks you out of your own turf or request.
