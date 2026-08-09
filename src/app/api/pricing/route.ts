import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { normalizeName, sameName } from '@/lib/names';
import { isValidTime, timeToMinutes } from '@/lib/pricing';

// Peak/off-peak rules for a turf. Reading is public — consumers need prices to
// show the slot grid — but only the turf's owner may add one.

export async function GET(req: NextRequest) {
  const turfId = new URL(req.url).searchParams.get('turf_id');
  if (!turfId) {
    return NextResponse.json({ error: 'turf_id is required' }, { status: 400 });
  }
  const rules = db
    .prepare('SELECT id, turf_id, start_time, end_time, price FROM pricing_rules WHERE turf_id = ? ORDER BY start_time')
    .all(turfId);
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

  const { turf_id, start_time, end_time, price, acting_as } = body;

  if (!turf_id || !start_time || !end_time || price === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (typeof acting_as !== 'string' || !normalizeName(acting_as)) {
    return NextResponse.json({ error: 'acting_as is required' }, { status: 400 });
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

  const turf = db.prepare('SELECT owner_name FROM turfs WHERE id = ?').get(turf_id) as
    | { owner_name: string }
    | undefined;
  if (!turf) return NextResponse.json({ error: 'Turf not found' }, { status: 404 });
  if (!sameName(turf.owner_name, acting_as)) {
    return NextResponse.json({ error: "Only this turf's owner can change its prices" }, { status: 403 });
  }

  const result = db
    .prepare('INSERT INTO pricing_rules (turf_id, start_time, end_time, price) VALUES (?, ?, ?, ?)')
    .run(turf_id, start_time, end_time, priceNum);

  const rule = db.prepare('SELECT id, turf_id, start_time, end_time, price FROM pricing_rules WHERE id = ?')
    .get(result.lastInsertRowid);
  return NextResponse.json(rule, { status: 201 });
}
