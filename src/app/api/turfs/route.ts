import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const locality = searchParams.get('locality');
  const sport = searchParams.get('sport');
  const ownerName = searchParams.get('owner_name');

  // Nested fragments keep every value parameterised — no string concatenation
  // into SQL, which is what the old query builder was doing by hand.
  const turfs = await sql`
    SELECT * FROM turfs
     WHERE TRUE
       ${locality ? sql`AND locality = ${locality}` : sql``}
       ${sport ? sql`AND sport = ${sport}` : sql``}
       ${ownerName ? sql`AND owner_name = ${ownerName}` : sql``}
     ORDER BY id DESC
  `;
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

  const inserted = await sql`
    INSERT INTO turfs (name, owner_name, locality, sport, price_per_hour, open_time, close_time, photo_emoji, photo_url)
    VALUES (
      ${name}, ${owner_name}, ${locality}, ${sport}, ${price_per_hour},
      ${open_time || '06:00'}, ${close_time || '23:00'}, ${photo_emoji || '⚽'}, ${photo_url ?? null}
    )
    RETURNING *
  `;

  return NextResponse.json(inserted[0], { status: 201 });
}
