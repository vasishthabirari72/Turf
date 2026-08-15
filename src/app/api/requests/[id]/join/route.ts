import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { includesName } from '@/lib/names';

// Joining is request-then-approve: the player lands in pending_joiners and only
// moves to players_joined once the request's creator approves via /respond.
// No body is read: the only thing it used to carry was the joiner's name, and
// that now comes from the session.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // You can only ask to join as yourself. player_name used to come from the
  // body, so anyone could put anyone else's name into a game's pending list.
  const auth = await requireUser();
  if ('error' in auth) return auth.error;
  const player_name = auth.user.name;

  const requestId = Number(id);
  if (!Number.isInteger(requestId)) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  const rows = await sql<
    { id: number; players_needed: number; players_joined: string; pending_joiners: string; status: string }[]
  >`SELECT * FROM player_requests WHERE id = ${requestId}`;

  const row = rows[0];
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

  const updated = await sql<Record<string, unknown>[]>`
    UPDATE player_requests SET pending_joiners = ${JSON.stringify(pending)}
     WHERE id = ${requestId}
     RETURNING *
  `;

  return NextResponse.json({
    ...updated[0],
    players_joined: JSON.parse(updated[0].players_joined as string),
    pending_joiners: JSON.parse(updated[0].pending_joiners as string),
  });
}
