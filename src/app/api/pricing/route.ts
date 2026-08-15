import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { requireTurfOwner } from '@/lib/auth';
import { isValidTime, timeToMinutes } from '@/lib/pricing';

// Peak/off-peak rules for a turf. Reading is public — consumers need prices to
// show the slot grid — but only the turf's owner may add one.

export async function GET(req: NextRequest) {
  const turfIdParam = new URL(req.url).searchParams.get('turf_id');
  if (!turfIdParam) {
    return NextResponse.json({ error: 'turf_id is required' }, { status: 400 });
  }
  const turfId = Number(turfIdParam);
  if (!Number.isInteger(turfId)) {
    return NextResponse.json({ error: 'turf_id must be a number' }, { status: 400 });
  }

  const rules = await sql`
    SELECT id, turf_id, start_time, end_time, price
      FROM pricing_rules
     WHERE turf_id = ${turfId}
     ORDER BY start_time
  `;
  return NextResponse.json(rules);
}

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
    if (body === null || typeof body !== 'object') throw new Error('body is not an object');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { turf_id, start_time, end_time, price } = body;

  if (!turf_id || !start_time || !end_time || price === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!isValidTime(start_time) || !isValidTime(end_time)) {
    return NextResponse.json({ error: 'Times must look like 18:00' }, { status: 400 });
  }
  // No wrap-around past midnight: a rule is a window within one day, which is
  // also what priceForSlot assumes.
  if (timeToMinutes(start_time) >= timeToMinutes(end_time)) {
    return NextResponse.json({ error: 'The end time must be after the start time' }, { status: 400 });
  }
  const priceNum = Number(price);
  if (!Number.isInteger(priceNum) || priceNum <= 0) {
    return NextResponse.json({ error: 'Price must be a whole number above zero' }, { status: 400 });
  }

  // Prices decide what every customer is charged, so only the turf's own owner
  // may set them -- established from the session, not from a name in the body.
  const auth = await requireTurfOwner(Number(turf_id));
  if ('error' in auth) return auth.error;

  const inserted = await sql`
    INSERT INTO pricing_rules (turf_id, start_time, end_time, price)
    VALUES (${turf_id}, ${start_time}, ${end_time}, ${priceNum})
    RETURNING id, turf_id, start_time, end_time, price
  `;
  return NextResponse.json(inserted[0], { status: 201 });
}
