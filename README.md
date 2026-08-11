# MaidaanConnect

A working demo of a turf booking + player-matchmaking platform, built to show turf owners
in person before investing in a full production build. Runs on Next.js with hosted
Postgres, so it deploys to Vercel.

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

This needs a Postgres database. The free tier of [Neon](https://neon.tech) is what it is
set up for, but any Postgres works.

```bash
npm install
cp .env.local.example .env.local     # then paste your connection string into it
npm run migrate                      # create the tables (safe to re-run)
npm run seed                         # demo data; refuses if the database already has turfs
npm run dev
```

Then open **http://localhost:3000** in your browser.

`npm run seed -- --force` wipes the demo tables and reseeds from scratch, resetting the
ids so `/turf/1` is the first seeded turf again.

Schema creation and seeding are deliberately **not** automatic. They used to run on import
when the database was a local SQLite file; against a shared hosted database that would mean
running DDL on every cold start and trying to reseed live data on every deploy.

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

## Deploying to Vercel

The database is hosted Postgres, so the app runs on serverless now.

1. Create a Neon project and copy the **pooled** connection string (the host contains
   `-pooler`).
2. Run `npm run migrate` and `npm run seed` locally against it once, with `DATABASE_URL`
   set in `.env.local`.
3. Import the repo into Vercel and set `DATABASE_URL` as an environment variable for
   Production, Preview and Development.
4. Deploy.

**One thing is still broken on Vercel: photo uploads.** `src/app/api/upload/route.ts`
writes to `public/turf-photos` on local disk, which is exactly the constraint that forced
the database off SQLite — a serverless filesystem is read-only. Uploading a photo on a
deployed build fails with "Could not save that photo". Everything else works: turfs with
no photo fall back to their emoji, and the committed `seed-*.svg` files ship with the
build so seeded turfs keep their pictures. Fixing it means object storage (Vercel Blob is
the smallest change); there is a TODO at the top of that route with the details.

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
src/lib/db.ts               → Postgres client (postgres.js) + unique-constraint helper
src/lib/schema.ts           → CREATE TABLE / column migrations, run by the scripts
src/lib/pricing.ts          → peak/off-peak rule matching, shared by API and UI
scripts/migrate.ts          → npm run migrate
scripts/seed.ts             → npm run seed
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
