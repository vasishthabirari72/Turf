import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { includesName, sameName } from '@/lib/names';

/**
 * Phone numbers for a game, so the people playing it can actually reach each
 * other. Approving someone used to be the end of the flow: nothing was ever
 * handed over, so no game could be arranged.
 *
 * Deliberately narrow, because a phone number is the most sensitive thing this
 * app stores. Exactly two people see anything:
 *
 *   - the creator sees the approved joiners
 *   - an approved joiner sees the creator
 *
 * Someone still pending sees nothing — approval is what unlocks it, in both
 * directions. Anyone else, signed in or not, is refused outright rather than
 * given an empty list, so this cannot be used to test whether a name is on a
 * game. Nothing here is exposed on the public listing.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await requireUser();
  if ('error' in auth) return auth.error;
  const me = auth.user.name;

  const requestId = Number(id);
  if (!Number.isInteger(requestId)) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  const rows = await sql<{ creator_name: string; players_joined: string }[]>`
    SELECT creator_name, players_joined FROM player_requests WHERE id = ${requestId}
  `;
  const row = rows[0];
  if (!row) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

  const joined: string[] = JSON.parse(row.players_joined);
  const isCreator = sameName(row.creator_name, me);
  const isApproved = includesName(joined, me);

  if (!isCreator && !isApproved) {
    return NextResponse.json(
      { error: 'Only the people playing this game can see contact details.' },
      { status: 403 }
    );
  }

  // The creator gets everyone approved; an approved joiner gets the creator.
  // A joiner is not given the other joiners: they asked to join a game, not to
  // have their number passed around the group.
  const wanted = isCreator ? joined : [row.creator_name];
  if (wanted.length === 0) return NextResponse.json({ contacts: [] });

  const people = await sql<{ name: string; phone: string | null }[]>`
    SELECT name, phone FROM users
     WHERE LOWER(TRIM(name)) = ANY(${wanted.map((n) => n.trim().toLowerCase())})
  `;

  // Names are returned as they were stored on the game, so someone who never
  // saved a profile still appears — with no number rather than being missing.
  const byName = new Map(people.map((p) => [p.name.trim().toLowerCase(), p.phone]));
  const contacts = wanted.map((name) => ({
    name,
    phone: byName.get(name.trim().toLowerCase()) ?? null,
  }));

  return NextResponse.json(
    { contacts, role: isCreator ? 'creator' : 'joiner' },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
