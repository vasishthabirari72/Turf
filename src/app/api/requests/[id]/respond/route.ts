import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { normalizeName, sameName } from '@/lib/names';

// The creator approves or rejects someone sitting in pending_joiners.
// Approve moves them into players_joined; reject just drops them.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Reject unparseable/non-object bodies as 400 rather than crashing to a 500.
  let body;
  try {
    body = await req.json();
    if (body === null || typeof body !== 'object') throw new Error('body is not an object');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { player_name, action, acting_as } = body;

  if (!player_name || !action || typeof acting_as !== 'string' || !normalizeName(acting_as)) {
    return NextResponse.json({ error: 'player_name, action and acting_as are required' }, { status: 400 });
  }
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const row = db.prepare('SELECT * FROM player_requests WHERE id = ?').get(id) as
    | {
        id: number;
        creator_name: string;
        players_needed: number;
        players_joined: string;
        pending_joiners: string;
        status: string;
      }
    | undefined;

  if (!row) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

  // Same fidelity as the rest of the app's identity model: a self-declared name,
  // not an authenticated one. Checked before anything else is revealed so a
  // non-creator can't use this endpoint to probe who is pending.
  if (!sameName(row.creator_name, acting_as)) {
    return NextResponse.json({ error: 'Only the person who posted this request can respond to it' }, { status: 403 });
  }

  const joined: string[] = JSON.parse(row.players_joined);
  const pending: string[] = JSON.parse(row.pending_joiners);

  if (!pending.includes(player_name)) {
    return NextResponse.json({ error: 'That player has not requested to join' }, { status: 404 });
  }

  const remainingPending = pending.filter((p) => p !== player_name);

  if (action === 'reject') {
    db.prepare('UPDATE player_requests SET pending_joiners = ? WHERE id = ?').run(
      JSON.stringify(remainingPending),
      id
    );
  } else {
    // Don't let an approval push the roster past what was asked for.
    if (joined.length >= row.players_needed) {
      return NextResponse.json({ error: 'This request is already full' }, { status: 409 });
    }
    joined.push(player_name);
    const newStatus = joined.length >= row.players_needed ? 'full' : 'open';
    db.prepare(
      'UPDATE player_requests SET players_joined = ?, pending_joiners = ?, status = ? WHERE id = ?'
    ).run(JSON.stringify(joined), JSON.stringify(remainingPending), newStatus, id);
  }

  const updated = db.prepare('SELECT * FROM player_requests WHERE id = ?').get(id) as Record<string, unknown>;
  return NextResponse.json({
    ...updated,
    players_joined: JSON.parse(updated.players_joined as string),
    pending_joiners: JSON.parse(updated.pending_joiners as string),
  });
}
