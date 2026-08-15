import { NextRequest, NextResponse } from 'next/server';
import sql, { isUniqueConstraintError } from '@/lib/db';
import { requireTurfOwner } from '@/lib/auth';

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

  const { turf_id, date, start_time, action, note, amount } = body;

  // What the owner collected in cash for this slot, so a phone or walk-in
  // booking lands in the same ledger as an app booking. Optional on purpose:
  // blocking for maintenance or personal use has no money attached, and
  // forcing a number would either stop the block or invent a false zero.
  let recordedAmount: number | null = null;
  if (amount !== undefined && amount !== null && String(amount).trim() !== '') {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'Amount must be a number, or left blank' }, { status: 400 });
    }
    recordedAmount = Math.round(n);
  }

  if (!turf_id || !date || !start_time || !action) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  // Only this turf's owner may block or release its slots, established from the
  // session cookie. This used to be an `acting_as` name in the request body,
  // which anyone could set to the owner's name; now the caller has to actually
  // hold a session for that account. Checked before the slot lookup so a
  // non-owner cannot probe slot state.
  const auth = await requireTurfOwner(Number(turf_id));
  if ('error' in auth) return auth.error;

  const existingRows = await sql<{ id: number; status: string }[]>`
    SELECT id, status FROM slot_overrides
     WHERE turf_id = ${turf_id} AND date = ${date} AND start_time = ${start_time}
  `;
  const existing = existingRows[0];

  if (action === 'block') {
    // Fast pre-check; the unique index is what actually guarantees exclusivity.
    if (existing) {
      return NextResponse.json({ error: 'Slot is already unavailable' }, { status: 409 });
    }
    try {
      await sql`
        INSERT INTO slot_overrides (turf_id, date, start_time, status, note, price)
        VALUES (${turf_id}, ${date}, ${start_time}, 'manual_block', ${note || 'Blocked by owner'}, ${recordedAmount})
      `;
    } catch (err) {
      // A booking landed on this slot between our SELECT and this INSERT.
      if (isUniqueConstraintError(err)) {
        return NextResponse.json({ error: SLOT_TAKEN }, { status: 409 });
      }
      throw err;
    }
    return NextResponse.json({ ok: true, status: 'manual_block', amount: recordedAmount });
  }

  if (action === 'unblock') {
    if (!existing || existing.status !== 'manual_block') {
      return NextResponse.json(
        { error: 'Only manually-blocked slots can be released here. App bookings must be cancelled instead.' },
        { status: 409 }
      );
    }
    await sql`DELETE FROM slot_overrides WHERE id = ${existing.id}`;
    return NextResponse.json({ ok: true, status: 'open' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
