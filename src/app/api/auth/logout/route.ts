import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

// Destroying the session clears the cookie server-side, so signing out does not
// depend on the browser cooperating the way clearing localStorage did.
export async function POST() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
