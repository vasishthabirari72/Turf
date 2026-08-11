import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const locality = searchParams.get('locality');
  const sport = searchParams.get('sport');

  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM player_requests
     WHERE TRUE
       ${locality ? sql`AND locality = ${locality}` : sql``}
       ${sport ? sql`AND sport = ${sport}` : sql``}
     ORDER BY date ASC, time ASC
  `;

  const requests = rows.map((r) => ({
    ...r,
    players_joined: JSON.parse(r.players_joined as string),
    pending_joiners: JSON.parse(r.pending_joiners as string),
  }));
  return NextResponse.json(requests);
}

export async function POST(req: NextRequest) {
  // Reject unparseable/non-object bodies as 400 rather than crashing to a 500.
  let body;
  try {
    body = await req.json();
    if (body === null || typeof body !== 'object') throw new Error('body is not an object');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { creator_name, sport, locality, date, time, players_needed } = body;

  if (!creator_name || !sport || !locality || !date || !time || !players_needed) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const inserted = await sql<Record<string, unknown>[]>`
    INSERT INTO player_requests (creator_name, sport, locality, date, time, players_needed, players_joined, pending_joiners, status)
    VALUES (${creator_name}, ${sport}, ${locality}, ${date}, ${time}, ${players_needed}, '[]', '[]', 'open')
    RETURNING *
  `;
  const row = inserted[0];

  return NextResponse.json(
    {
      ...row,
      players_joined: JSON.parse(row.players_joined as string),
      pending_joiners: JSON.parse(row.pending_joiners as string),
    },
    { status: 201 }
  );
}
