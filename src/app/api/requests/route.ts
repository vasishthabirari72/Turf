import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const locality = searchParams.get('locality');
  const sport = searchParams.get('sport');

  let query = 'SELECT * FROM player_requests WHERE 1=1';
  const params: string[] = [];
  if (locality) {
    query += ' AND locality = ?';
    params.push(locality);
  }
  if (sport) {
    query += ' AND sport = ?';
    params.push(sport);
  }
  query += ' ORDER BY date ASC, time ASC';

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
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

  const stmt = db.prepare(`
    INSERT INTO player_requests (creator_name, sport, locality, date, time, players_needed, players_joined, pending_joiners, status)
    VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', 'open')
  `);
  const result = stmt.run(creator_name, sport, locality, date, time, players_needed);
  const row = db.prepare('SELECT * FROM player_requests WHERE id = ?').get(result.lastInsertRowid) as Record<
    string,
    unknown
  >;
  return NextResponse.json(
    {
      ...row,
      players_joined: JSON.parse(row.players_joined as string),
      pending_joiners: JSON.parse(row.pending_joiners as string),
    },
    { status: 201 }
  );
}
