import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { normalizeName } from '@/lib/names';
import { isUniqueConstraintError } from '@/lib/db';
import { getSession, hashPassword, MIN_PASSWORD_LENGTH, type Role } from '@/lib/auth';

// Create an account and sign in as it.
//
// The raw password exists only as a local variable here: it is hashed, and the
// hash is what reaches the database. It is never echoed back, never written to
// a log line, and never included in an error message.
//
// TODO: no rate limiting. A validation-phase app with a handful of real users
// can live with that; a public one needs it on this route and on login.

const ROLES: Role[] = ['player', 'owner'];

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
    if (body === null || typeof body !== 'object') throw new Error('body is not an object');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { name, password, role } = body;

  if (typeof name !== 'string' || !normalizeName(name)) {
    return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Please choose a password of at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 }
    );
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: 'Please choose how you will use MaidaanConnect.' }, { status: 400 });
  }

  const cleanName = name.trim();

  const taken = await sql<{ id: number }[]>`
    SELECT id FROM users WHERE LOWER(TRIM(name)) = ${normalizeName(cleanName)}
  `;
  if (taken.length > 0) {
    return NextResponse.json(
      { error: 'That name is already registered. Try signing in instead.' },
      { status: 409 }
    );
  }

  const password_hash = await hashPassword(password);

  let created;
  try {
    const rows = await sql<{ id: number; name: string; role: Role }[]>`
      INSERT INTO users (name, role, password_hash)
      VALUES (${cleanName}, ${role}, ${password_hash})
      RETURNING id, name, role
    `;
    created = rows[0];
  } catch (err) {
    // Two signups for the same name at once: the unique index on lower(name) is
    // what actually decides, and the loser is told the name is taken.
    if (isUniqueConstraintError(err)) {
      return NextResponse.json(
        { error: 'That name is already registered. Try signing in instead.' },
        { status: 409 }
      );
    }
    throw err;
  }

  const session = await getSession();
  session.userId = created.id;
  session.role = created.role;
  await session.save();

  return NextResponse.json({ user: created }, { status: 201 });
}
