import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const locality = searchParams.get('locality');
  const sport = searchParams.get('sport');
  const ownerName = searchParams.get('owner_name');

  let query = 'SELECT * FROM turfs WHERE 1=1';
  const params: string[] = [];

  if (locality) {
    query += ' AND locality = ?';
    params.push(locality);
  }
  if (sport) {
    query += ' AND sport = ?';
    params.push(sport);
  }
  if (ownerName) {
    query += ' AND owner_name = ?';
    params.push(ownerName);
  }
  query += ' ORDER BY id DESC';

  const turfs = db.prepare(query).all(...params);
  return NextResponse.json(turfs);
}

export async function POST(req: NextRequest) {
  // Same guard as the other write routes: a malformed or empty body would
  // otherwise throw before validation and surface as an unhandled 500.
  let body;
  try {
    body = await req.json();
    if (body === null || typeof body !== 'object') throw new Error('body is not an object');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { name, owner_name, locality, sport, price_per_hour, open_time, close_time, photo_emoji, photo_url } = body;

  if (!name || !owner_name || !locality || !sport || !price_per_hour) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Only ever a path we produced. Rejecting anything else stops a caller
  // pointing a turf's image at an arbitrary external or javascript: URL.
  if (photo_url != null && !/^\/turf-photos\/[A-Za-z0-9._-]+$/.test(String(photo_url))) {
    return NextResponse.json({ error: 'Invalid photo_url' }, { status: 400 });
  }

  const stmt = db.prepare(`
    INSERT INTO turfs (name, owner_name, locality, sport, price_per_hour, open_time, close_time, photo_emoji, photo_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    name,
    owner_name,
    locality,
    sport,
    price_per_hour,
    open_time || '06:00',
    close_time || '23:00',
    photo_emoji || '⚽',
    photo_url ?? null
  );

  const turf = db.prepare('SELECT * FROM turfs WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(turf, { status: 201 });
}
