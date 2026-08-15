import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { normalizeName } from '@/lib/names';
import { getSession, verifyPassword, hashPassword, type Role } from '@/lib/auth';

// One deliberately vague message for every failure. Saying "no such account"
// versus "wrong password" would let anyone check which names are registered.
const REJECTED = 'That name and password do not match an account.';

// Compared against when the account does not exist, so a missing account and a
// wrong password take roughly the same time to answer. Without this, response
// timing alone reveals which names are registered.
let dummyHashPromise: Promise<string> | null = null;
const dummyHash = () => (dummyHashPromise ??= hashPassword('not-a-real-password'));

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
    if (body === null || typeof body !== 'object') throw new Error('body is not an object');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { name, password } = body;

  if (typeof name !== 'string' || typeof password !== 'string' || !normalizeName(name) || !password) {
    return NextResponse.json({ error: 'Please enter your name and password.' }, { status: 400 });
  }

  const rows = await sql<{ id: number; name: string; role: Role; password_hash: string }[]>`
    SELECT id, name, role, password_hash
      FROM users
     WHERE LOWER(TRIM(name)) = ${normalizeName(name)}
  `;
  const user = rows[0];

  if (!user) {
    await verifyPassword(password, await dummyHash());
    return NextResponse.json({ error: REJECTED }, { status: 401 });
  }

  // An account carried over from before passwords existed has an empty hash;
  // verifyPassword refuses it outright rather than comparing.
  if (!(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: REJECTED }, { status: 401 });
  }

  const session = await getSession();
  session.userId = user.id;
  session.role = user.role;
  await session.save();

  return NextResponse.json({ user: { id: user.id, name: user.name, role: user.role } });
}
