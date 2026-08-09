import { NextRequest, NextResponse } from 'next/server';
import db, { isUniqueConstraintError } from '@/lib/db';
import { priceForSlot, type PricingRule } from '@/lib/pricing';

const SLOT_TAKEN = 'This slot was just taken. Please pick another time.';

// 'cod' is pay-in-cash-at-the-turf. Kept in sync with PAY_METHODS in
// src/app/turf/[id]/page.tsx — the owner calendar reads this value back to
// decide which bookings still need money collected in person.
const PAYMENT_METHODS = ['card', 'upi', 'cod'];

export async function POST(req: NextRequest) {
  // A malformed or empty body would otherwise throw before any validation runs
  // and surface as an unhandled 500. A null body parses fine but blows up on
  // the destructure below, so it is rejected here too.
  let body;
  try {
    body = await req.json();
    if (body === null || typeof body !== 'object') throw new Error('body is not an object');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { turf_id, date, start_time, customer_name, payment_method } = body;

  if (!turf_id || !date || !start_time || !customer_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Optional, so older clients and bookings made before this existed still work;
  // stored as NULL when absent. Rejected outright if present but nonsense, so
  // the owner's calendar can trust the value it reads back.
  // null is treated the same as omitting it — a client serialising an optional
  // field shouldn't get a 400 for saying "no method" explicitly.
  if (payment_method != null && !PAYMENT_METHODS.includes(payment_method)) {
    return NextResponse.json(
      { error: `payment_method must be one of: ${PAYMENT_METHODS.join(', ')}` },
      { status: 400 }
    );
  }
  const method: string | null = payment_method ?? null;

  const existing = db
    .prepare('SELECT id FROM slot_overrides WHERE turf_id = ? AND date = ? AND start_time = ?')
    .get(turf_id, date, start_time);

  // Fast pre-check: cheap, and gives the common case a clean answer without
  // throwing. The unique index below is what actually guarantees exclusivity.
  if (existing) {
    return NextResponse.json({ error: SLOT_TAKEN }, { status: 409 });
  }

  const turf = db.prepare('SELECT price_per_hour FROM turfs WHERE id = ?').get(turf_id) as
    | { price_per_hour: number }
    | undefined;
  if (!turf) return NextResponse.json({ error: 'Turf not found' }, { status: 404 });

  // Resolve the price server-side from the pricing rules rather than trusting
  // anything the client sends, and store it, so a later rule change never
  // rewrites what this booking cost.
  const rules = db
    .prepare('SELECT id, turf_id, start_time, end_time, price FROM pricing_rules WHERE turf_id = ?')
    .all(turf_id) as unknown as PricingRule[];
  const price = priceForSlot(start_time, rules, turf.price_per_hour);

  const stmt = db.prepare(
    `INSERT INTO slot_overrides (turf_id, date, start_time, status, customer_name, payment_method, price)
     VALUES (?, ?, ?, 'app_booking', ?, ?, ?)`
  );

  let result;
  try {
    result = stmt.run(turf_id, date, start_time, customer_name, method, price);
  } catch (err) {
    // Another request won the race between our SELECT and this INSERT.
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ error: SLOT_TAKEN }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json(
    {
      ok: true,
      booking: {
        id: result.lastInsertRowid,
        turf_id,
        date,
        start_time,
        customer_name,
        payment_method: method,
        price,
      },
    },
    { status: 201 }
  );
}
