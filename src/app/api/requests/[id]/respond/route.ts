import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { sameName } from '@/lib/names';

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

  // Approving or declining is the creator's call, and who the creator is comes
  // from the session. acting_as was a body field the caller filled in, so
  // anyone could approve joiners to a game they had nothing to do with.
  const auth = await requireUser();
  if ('error' in auth) return auth.error;
  const acting_as = auth.user.name;

  const { player_name, action } = body;

  if (!player_name || !action) {
    return NextResponse.json({ error: 'player_name and action are required' }, { status: 400 });
  }
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const requestId = Number(id);
  if (!Number.isInteger(requestId)) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  const rows = await sql<
    {
      id: number;
      creator_name: string;
      players_needed: number;
      players_joined: string;
      pending_joiners: string;
      status: string;
    }[]
  >`SELECT * FROM player_requests WHERE id = ${requestId}`;

  const row = rows[0];
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
    await sql`
      UPDATE player_requests SET pending_joiners = ${JSON.stringify(remainingPending)}
       WHERE id = ${requestId}
    `;
  } else {
    // Don't let an approval push the roster past what was asked for.
    if (joined.length >= row.players_needed) {
      return NextResponse.json({ error: 'This request is already full' }, { status: 409 });
    }
    joined.push(player_name);
    const newStatus = joined.length >= row.players_needed ? 'full' : 'open';
    await sql`
      UPDATE player_requests
         SET players_joined = ${JSON.stringify(joined)},
             pending_joiners = ${JSON.stringify(remainingPending)},
             status = ${newStatus}
       WHERE id = ${requestId}
    `;
  }

  const updated = await sql<Record<string, unknown>[]>`
    SELECT * FROM player_requests WHERE id = ${requestId}
  `;

  return NextResponse.json({
    ...updated[0],
    players_joined: JSON.parse(updated[0].players_joined as string),
    pending_joiners: JSON.parse(updated[0].pending_joiners as string),
  });
}
