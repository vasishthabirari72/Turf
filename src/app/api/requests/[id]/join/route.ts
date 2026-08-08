import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { includesName, normalizeName } from '@/lib/names';

// Joining is request-then-approve: the player lands in pending_joiners and only
// moves to players_joined once the request's creator approves via /respond.
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

  const { player_name } = body;

  if (typeof player_name !== 'string' || !normalizeName(player_name)) {
    return NextResponse.json({ error: 'player_name is required' }, { status: 400 });
  }

  const row = db.prepare('SELECT * FROM player_requests WHERE id = ?').get(id) as
    | { id: number; players_needed: number; players_joined: string; pending_joiners: string; status: string }
    | undefined;

  if (!row) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  if (row.status === 'full') return NextResponse.json({ error: 'This request is already full' }, { status: 409 });

  const joined: string[] = JSON.parse(row.players_joined);
  const pending: string[] = JSON.parse(row.pending_joiners);

  // A player belongs to at most one list, and never to the same one twice —
  // matched case-insensitively so "bob" can't slip in alongside "Bob".
  if (includesName(joined, player_name)) {
    return NextResponse.json({ error: 'You have already joined this request' }, { status: 409 });
  }
  if (includesName(pending, player_name)) {
    return NextResponse.json({ error: 'You have already requested to join. Waiting on approval.' }, { status: 409 });
  }

  // Stored as typed (minus stray whitespace) so the creator sees the name the
  // player actually chose, not a lowercased version of it.
  pending.push(player_name.trim());

  db.prepare('UPDATE player_requests SET pending_joiners = ? WHERE id = ?').run(JSON.stringify(pending), id);

  const updated = db.prepare('SELECT * FROM player_requests WHERE id = ?').get(id) as Record<string, unknown>;
  return NextResponse.json({
    ...updated,
    players_joined: JSON.parse(updated.players_joined as string),
    pending_joiners: JSON.parse(updated.pending_joiners as string),
  });
}
