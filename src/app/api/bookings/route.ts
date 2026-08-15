import { NextRequest, NextResponse } from 'next/server';
import sql, { isUniqueConstraintError } from '@/lib/db';
import { requireUser } from '@/lib/auth';
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

  // Booking is open to any signed-in account, player or owner alike -- it is
  // not an owner action. The booking is recorded under the session's name, so
  // nobody can put a slot in someone else's name.
  const auth = await requireUser();
  if ('error' in auth) return auth.error;
  const customer_name = auth.user.name;

  const { turf_id, date, start_time, payment_method } = body;

  if (!turf_id || !date || !start_time) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // null is treated the same as omitting it — a client serialising an optional
  // field shouldn't get a 400 for saying "no method" explicitly.
  if (payment_method != null && !PAYMENT_METHODS.includes(payment_method)) {
    return NextResponse.json(
      { error: `payment_method must be one of: ${PAYMENT_METHODS.join(', ')}` },
      { status: 400 }
    );
  }
  const method: string | null = payment_method ?? null;

  const existing = await sql<{ id: number }[]>`
    SELECT id FROM slot_overrides
     WHERE turf_id = ${turf_id} AND date = ${date} AND start_time = ${start_time}
  `;

  // Fast pre-check: cheap, and gives the common case a clean answer without
  // throwing. The unique index below is what actually guarantees exclusivity.
  if (existing.length > 0) {
    return NextResponse.json({ error: SLOT_TAKEN }, { status: 409 });
  }

  const turfRows = await sql<{ price_per_hour: number }[]>`
    SELECT price_per_hour FROM turfs WHERE id = ${turf_id}
  `;
  if (turfRows.length === 0) return NextResponse.json({ error: 'Turf not found' }, { status: 404 });

  // Resolve the price server-side from the pricing rules rather than trusting
  // anything the client sends, and store it, so a later rule change never
  // rewrites what this booking cost.
  const rules = await sql<PricingRule[]>`
    SELECT id, turf_id, start_time, end_time, price FROM pricing_rules WHERE turf_id = ${turf_id}
  `;
  const price = priceForSlot(start_time, rules, turfRows[0].price_per_hour);

  let insertedId: number;
  try {
    const inserted = await sql<{ id: number }[]>`
      INSERT INTO slot_overrides (turf_id, date, start_time, status, customer_name, payment_method, price)
      VALUES (${turf_id}, ${date}, ${start_time}, 'app_booking', ${customer_name}, ${method}, ${price})
      RETURNING id
    `;
    insertedId = inserted[0].id;
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
        id: insertedId,
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
