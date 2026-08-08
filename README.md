# MaidaanConnect — Localhost Demo

A working demo of a turf booking + player-matchmaking platform, built to show turf owners
in person before investing in a full production build.

## What's in this demo

- **Owner side**: sign in with just a name, list a turf in under a minute, see a day-by-day
  slot calendar, and mark any slot unavailable with one tap (for phone/walk-in bookings) —
  this is the feature that keeps the app in sync with how owners already take bookings.
- **Consumer side**: search turfs by locality and sport, see live slot availability, book a
  slot (payment is mocked — no real money moves).
- **Find Players**: post a request for players, browse open requests near you, join one.

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

- Real payments (Razorpay/UPI) — booking just has a "Confirm booking (mock pay)" button
- OTP/SMS login — just a name field
- Real maps/geolocation — locality is a dropdown, not GPS
- Push notifications
- Mobile app — this is a responsive website, works fine on a phone browser for demo purposes

These get added once you've validated real demand with owners (see the roadmap docs for
what production would add).

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
src/lib/db.ts                → SQLite schema + seed data
```
