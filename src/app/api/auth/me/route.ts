import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

// Who the session says you are. The client uses this to decide what to render;
// it is not a permission check in itself — every protected action re-checks on
// the server, so a tampered client can only mislead itself.
export async function GET() {
  const user = await getCurrentUser();
  // Never cached: the answer is per-request and changes on sign in/out.
  return NextResponse.json(
    { user },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
