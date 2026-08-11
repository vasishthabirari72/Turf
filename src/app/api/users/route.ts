import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { normalizeName } from '@/lib/names';

// Saved details, keyed by name. No password, session or identity check — this
// only spares people retyping. A phone number stored here is never checked
// against anything.
//
// The name column is UNIQUE and Postgres compares text case-sensitively, which
// would let "Bob" and "bob" become two separate rows. Every lookup below
// normalises instead, so this table agrees with sameName() used elsewhere.

const ROLES = ['player', 'owner', 'both'];

interface UserRow {
  id: number;
  name: string;
  phone: string | null;
  role: string | null;
  created_at: string;
}

async function findByName(name: string): Promise<UserRow | undefined> {
  const rows = await sql<UserRow[]>`
    SELECT id, name, phone, role, created_at
      FROM users
     WHERE LOWER(TRIM(name)) = ${normalizeName(name)}
  `;
  return rows[0];
}

export async function GET(req: NextRequest) {
  const name = new URL(req.url).searchParams.get('name');
  if (!name || !normalizeName(name)) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const user = await findByName(name);
  if (!user) {
    // Not an error: someone who has never saved details simply has none yet.
    return NextResponse.json(null);
  }
  return NextResponse.json(user);
}

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
    if (body === null || typeof body !== 'object') throw new Error('body is not an object');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { name, phone, role } = body;

  if (typeof name !== 'string' || !normalizeName(name)) {
    return NextResponse.json({ error: 'Please enter your name' }, { status: 400 });
  }
  if (phone != null && typeof phone !== 'string') {
    return NextResponse.json({ error: 'Invalid phone' }, { status: 400 });
  }
  if (role != null && !ROLES.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${ROLES.join(', ')}` }, { status: 400 });
  }

  const cleanName = name.trim();
  const cleanPhone = typeof phone === 'string' ? phone.trim() || null : null;
  const existing = await findByName(cleanName);

  if (existing) {
    await sql`
      UPDATE users
         SET name = ${cleanName}, phone = ${cleanPhone}, role = ${role ?? existing.role ?? null}
       WHERE id = ${existing.id}
    `;
  } else {
    await sql`
      INSERT INTO users (name, phone, role) VALUES (${cleanName}, ${cleanPhone}, ${role ?? null})
    `;
  }

  return NextResponse.json(await findByName(cleanName), { status: existing ? 200 : 201 });
}
