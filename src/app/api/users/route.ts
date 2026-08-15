import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getCurrentUser, requireUser } from '@/lib/auth';

// Your own saved details. Both methods act on the session's account and take no
// name at all, which closes two holes the name-keyed version had:
//
//   - GET ?name=X handed anyone's phone number to anyone who asked for it.
//   - POST { name, role } wrote to whichever account matched the name, and
//     could set role. Now that role decides what an account may do, that was a
//     self-promotion route: any caller could make themselves an owner.
//
// role is therefore not writable here at all. It is fixed at signup.

interface UserRow {
  id: number;
  name: string;
  phone: string | null;
  role: string;
  created_at: string;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    // Signed out is not an error; there are simply no details to show.
    return NextResponse.json(null, { headers: { 'Cache-Control': 'no-store' } });
  }
  const rows = await sql<UserRow[]>`
    SELECT id, name, phone, role, created_at FROM users WHERE id = ${user.id}
  `;
  return NextResponse.json(rows[0] ?? null, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ('error' in auth) return auth.error;

  let body;
  try {
    body = await req.json();
    if (body === null || typeof body !== 'object') throw new Error('body is not an object');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { phone } = body;

  if (phone != null && typeof phone !== 'string') {
    return NextResponse.json({ error: 'Invalid phone' }, { status: 400 });
  }

  // The name is the login identifier now, so it cannot be edited here — doing
  // so would either break sign-in or let someone take a name already in use.
  const cleanPhone = typeof phone === 'string' ? phone.trim() || null : null;

  await sql`UPDATE users SET phone = ${cleanPhone} WHERE id = ${auth.user.id}`;

  const rows = await sql<UserRow[]>`
    SELECT id, name, phone, role, created_at FROM users WHERE id = ${auth.user.id}
  `;
  return NextResponse.json(rows[0]);
}
