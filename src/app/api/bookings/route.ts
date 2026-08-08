import { NextRequest, NextResponse } from 'next/server';
import db, { isUniqueConstraintError } from '@/lib/db';

const SLOT_TAKEN = 'This slot was just taken. Please pick another time.';

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

  const { turf_id, date, start_time, customer_name } = body;

  if (!turf_id || !date || !start_time || !customer_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const existing = db
    .prepare('SELECT id FROM slot_overrides WHERE turf_id = ? AND date = ? AND start_time = ?')
    .get(turf_id, date, start_time);

  // Fast pre-check: cheap, and gives the common case a clean answer without
  // throwing. The unique index below is what actually guarantees exclusivity.
  if (existing) {
    return NextResponse.json({ error: SLOT_TAKEN }, { status: 409 });
  }

  const stmt = db.prepare(
    `INSERT INTO slot_overrides (turf_id, date, start_time, status, customer_name) VALUES (?, ?, ?, 'app_booking', ?)`
  );

  let result;
  try {
    result = stmt.run(turf_id, date, start_time, customer_name);
  } catch (err) {
    // Another request won the race between our SELECT and this INSERT.
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ error: SLOT_TAKEN }, { status: 409 });
    }
    throw err;
  }

  const turf = db.prepare('SELECT * FROM turfs WHERE id = ?').get(turf_id) as { price_per_hour: number };

  return NextResponse.json(
    {
      ok: true,
      booking: {
        id: result.lastInsertRowid,
        turf_id,
        date,
        start_time,
        customer_name,
        price: turf.price_per_hour,
      },
    },
    { status: 201 }
  );
}
