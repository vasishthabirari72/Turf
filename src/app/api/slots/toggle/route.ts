import { NextRequest, NextResponse } from 'next/server';
import db, { isUniqueConstraintError } from '@/lib/db';
import { normalizeName, sameName } from '@/lib/names';

const SLOT_TAKEN = 'This slot was just taken. Please pick another time.';

// Owner taps a slot to mark it unavailable (phone booking, walk-in, maintenance)
// or taps again to release it back to open. Only touches manual_block slots —
// app_booking slots must be cancelled through the booking, not toggled here.
export async function POST(req: NextRequest) {
  // Reject unparseable/non-object bodies as 400 rather than crashing to a 500.
  let body;
  try {
    body = await req.json();
    if (body === null || typeof body !== 'object') throw new Error('body is not an object');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { turf_id, date, start_time, action, note, acting_as } = body;

  if (!turf_id || !date || !start_time || !action) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (typeof acting_as !== 'string' || !normalizeName(acting_as)) {
    return NextResponse.json({ error: 'acting_as is required' }, { status: 400 });
  }

  // Only the turf's owner may block or release its slots. Same fidelity as the
  // rest of the app's identity model — a self-declared name, not an
  // authenticated one — but it stops one owner touching another's calendar.
  // Checked before the slot lookup so a non-owner can't probe slot state.
  const turf = db.prepare('SELECT owner_name FROM turfs WHERE id = ?').get(turf_id) as
    | { owner_name: string }
    | undefined;

  if (!turf) return NextResponse.json({ error: 'Turf not found' }, { status: 404 });
  if (!sameName(turf.owner_name, acting_as)) {
    return NextResponse.json({ error: "Only this turf's owner can change its slots" }, { status: 403 });
  }

  const existing = db
    .prepare('SELECT * FROM slot_overrides WHERE turf_id = ? AND date = ? AND start_time = ?')
    .get(turf_id, date, start_time) as { status: string; id: number } | undefined;

  if (action === 'block') {
    // Fast pre-check; the unique index is what actually guarantees exclusivity.
    if (existing) {
      return NextResponse.json({ error: 'Slot is already unavailable' }, { status: 409 });
    }
    try {
      db.prepare(
        `INSERT INTO slot_overrides (turf_id, date, start_time, status, note) VALUES (?, ?, ?, 'manual_block', ?)`
      ).run(turf_id, date, start_time, note || 'Blocked by owner');
    } catch (err) {
      // A booking landed on this slot between our SELECT and this INSERT.
      if (isUniqueConstraintError(err)) {
        return NextResponse.json({ error: SLOT_TAKEN }, { status: 409 });
      }
      throw err;
    }
    return NextResponse.json({ ok: true, status: 'manual_block' });
  }

  if (action === 'unblock') {
    if (!existing || existing.status !== 'manual_block') {
      return NextResponse.json(
        { error: 'Only manually-blocked slots can be released here. App bookings must be cancelled instead.' },
        { status: 409 }
      );
    }
    db.prepare('DELETE FROM slot_overrides WHERE id = ?').run(existing.id);
    return NextResponse.json({ ok: true, status: 'open' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
