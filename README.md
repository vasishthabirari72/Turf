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
  book through a two-step checkout — pick a slot, then pay. With Razorpay keys set the
  payment is real (card/UPI/netbanking through Razorpay Checkout); without them the app
  falls back to a mocked card sheet so the demo still runs. See "Payments" below.
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

- Payment **webhooks** — payments themselves are now real (see "Payments"), but the
  booking is written on the browser's return trip. If the browser dies between the money
  leaving and that call landing, the payment exists and the booking does not. Razorpay's
  `payment.captured` webhook is what closes that gap, and is the one piece of payment work
  still outstanding.
- Refunds and cancellation — there is no way to cancel a booking, so the refund path for a
  lost race (paid, but the slot went first) is manual, from the Razorpay dashboard.
- OTP/SMS verification — see "How sign-in works" below. There are real passwords now, but
  no phone or email verification, so an account proves someone knows a password and
  nothing more about who they are.
- Real maps/geolocation — locality is a dropdown, not GPS
- Push notifications
- Mobile app — this is a responsive website, works fine on a phone browser for demo purposes

These get added once you've validated real demand with owners (see the roadmap docs for
what production would add).

## Contact sharing on a game

Approving a joiner used to be the end of the flow — nothing was handed over, so
no game could actually be arranged. `GET /api/requests/[id]/contacts` now returns
phone numbers, narrowly:

- the game's creator sees the **approved** joiners;
- an approved joiner sees the **creator**, and nobody else on the game.

Someone still pending sees nothing; approval is what unlocks it, in both
directions. Anyone else is refused outright rather than handed an empty list, so
the endpoint cannot be used to test whether a name is on a game, and no phone
number appears anywhere on the public games listing.

## Payments

Real payments run through **Razorpay Standard Checkout**. Two environment variables switch
them on:

```
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...   # the same key id, for the browser
```

Without them the checkout falls back to the old mocked card sheet, so a fresh clone with no
Razorpay account still demos end to end. Test keys (`rzp_test_...`) move no real money;
card `4111 1111 1111 1111`, any future expiry and any CVV always succeeds.

The flow is three steps, and the middle one is the browser's only job:

1. `POST /api/payments/create-order` — the server prices the slot and asks Razorpay for an
   order.
2. Razorpay Checkout opens in the browser and returns a payment id and a signature.
3. `POST /api/payments/verify` — the server recomputes the signature and, only then,
   writes the booking.

**The amount is never sent by the client.** `create-order` is told *which slot*, never *how
much*, and prices it with the same `priceForSlot` the booking route uses. A client-supplied
amount would let anyone pay ₹1 for a ₹1200 peak slot.

**A signature alone is not proof of payment.** It proves the response came from Razorpay,
not that money was captured or that it was for this slot — so `verify` also re-fetches the
order, requires `status === 'paid'`, and checks the order's notes match the turf, date,
slot and user being claimed. Verification and booking are the *same request*, so there is
no second call a client could skip.

`/api/bookings` deliberately does **not** accept `payment_method: 'razorpay'`. Only the
verify route may mark a booking as gateway-paid; otherwise anyone could label an unpaid
booking as paid.

A `payment_id` is stored per booking under a unique index, which makes verification
idempotent: a replayed success callback returns the original booking instead of
double-booking.

**What is still missing:** the `payment.captured` webhook, refunds, and cancellation — see
"What's intentionally NOT built" above. Do not describe this as a finished payments system
to anybody.

## How sign-in works, and what it does not cover

Accounts are a **name and a password**. Passwords are hashed with bcrypt (cost 12) and the
raw password is never stored, logged, or returned. The session lives in an **httpOnly,
encrypted cookie** (iron-session), so page scripts cannot read it — `document.cookie` shows
nothing. Signing out destroys it server-side.

An account is either a **player** or an **owner**, fixed at signup. Owner-only actions —
listing a turf, blocking or releasing a slot, setting prices, viewing takings, uploading a
photo — are checked **on the server, in the route handler**, against the session. Booking a
turf and joining a game only require being signed in; both roles can do them.

This replaced an `acting_as` name in the request body. That was never a real check: it was
a string the caller chose, so anyone could send an owner's name and be treated as them.
`src/proxy.ts` also bounces non-owners away from `/owner/*`, but that is only so they land
somewhere sensible — **delete it and nothing becomes permitted**, because the enforcement
is in `src/lib/auth.ts` next to the data.

**What this is still missing, honestly:**

- **No account recovery.** Names are the login identifier and there is no email or phone on
  an account, so there is nowhere to send a reset link. A forgotten password means a new
  account under a new name. This is the main reason to add email next.
- **No OTP or phone/email verification.** Nothing confirms a person is who they say.
- **No rate limiting** on signup or login, so passwords can be guessed at machine speed.
- **No CSRF tokens.** The session cookie is `SameSite=Lax`, which stops the ordinary
  cross-site form post, but that is a mitigation rather than a proper defence.
- **Roles cannot be changed in the app.** Making someone an owner is a database update,
  deliberately — a self-service switch would let any account grant itself the owner tools.

That set is a reasonable place to stop for a validation-phase app with a handful of real
users who know each other. It is **not** a finished production auth system, and it should
not be described as one to anybody.

`SESSION_PASSWORD` (32+ characters) must be set alongside `DATABASE_URL`; the app refuses to
start without it rather than falling back to a default anyone could guess. Changing it signs
everyone out.

Demo accounts created by `npm run seed` use the password `demo-turf-2026` — sample data in a
sample database, not a secret.

## Deploying to Vercel

The database is hosted Postgres, so the app runs on serverless now.

1. Create a Neon project and copy the **pooled** connection string (the host contains
   `-pooler`).
2. Run `npm run migrate` and `npm run seed` locally against it once, with `DATABASE_URL`
   set in `.env.local`.
3. Import the repo into Vercel and set `DATABASE_URL` as an environment variable for
   Production, Preview and Development.
4. For real payments, set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and
   `NEXT_PUBLIC_RAZORPAY_KEY_ID` too. `NEXT_PUBLIC_*` is inlined at build time, so
   changing it needs a redeploy, not just a restart. Leave all three unset to deploy with
   the mock checkout.
5. Deploy.

**Photo uploads need a Blob store.** `src/app/api/upload/route.ts` writes to Vercel Blob,
so `BLOB_READ_WRITE_TOKEN` has to be set — `vercel blob create-store <name> --access public
--yes` creates one and links it to the project. Without the token the route falls back to
writing `public/turf-photos` on local disk, which works when developing and cannot work on
a serverless host (the filesystem is read-only). That fallback is why uploads used to fail
on deploys with "Could not save that photo".

A failed upload no longer costs the owner the turf: the turf is created without a picture
and the owner is told the photo specifically didn't upload. `photo_url` is still restricted
to somewhere we put it — a `/turf-photos/` path or an object in our own blob store, matched
by parsing the URL rather than pattern-matching the string, so a host that merely *mentions*
the blob domain is rejected.

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
  api/payments/create-order → server-priced Razorpay order
  api/payments/verify       → signature check, then the booking is written
src/lib/db.ts               → Postgres client (postgres.js) + unique-constraint helper
src/lib/schema.ts           → CREATE TABLE / column migrations, run by the scripts
src/lib/pricing.ts          → peak/off-peak rule matching, shared by API and UI
src/lib/razorpay.ts         → gateway client + signature verification (server only)
src/lib/razorpay-checkout.ts→ browser-side Checkout loader
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
