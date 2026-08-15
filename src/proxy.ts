import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type SessionData } from '@/lib/auth';

/**
 * A first pass that bounces signed-out or non-owner visitors away from the
 * owner screens, so they get the sign-in page instead of a dashboard that
 * fails to load.
 *
 * This is NOT where access control happens. It is an optimistic check on the
 * cookie only — no database lookup — because it runs on every navigation
 * including prefetches. The checks that actually hold are in lib/auth.ts and
 * run inside each API route, next to the data. If this file were deleted, the
 * app would still refuse every owner action to a player; the difference would
 * only be where they find out.
 */
export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!path.startsWith('/owner')) return NextResponse.next();

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  if (!session.userId) {
    const url = new URL('/login', req.nextUrl);
    // Come back here once they are signed in.
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (session.role !== 'owner') {
    const url = new URL('/', req.nextUrl);
    url.searchParams.set('owner_only', '1');
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/owner/:path*'],
};
