import 'server-only';

import { cookies } from 'next/headers';
import { getIronSession, type IronSession } from 'iron-session';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import sql from './db.ts';
import { sameName } from './names.ts';

/**
 * Authentication and authorisation, in one place.
 *
 * Everything security-relevant reads from the encrypted session cookie, which
 * the browser cannot read or write (httpOnly) and cannot forge (sealed with
 * SESSION_PASSWORD). This replaces the old `acting_as` / `owner_name` request
 * fields, which were only ever strings a caller chose for themselves — anyone
 * could claim to be anyone by editing the request body.
 *
 * Nothing here trusts localStorage. The client copy of a name is a convenience
 * for pre-filling forms, never an identity.
 */

// The raw password is hashed on arrival and never stored, logged, or included
// in any response or error message. Only the bcrypt digest leaves this file.
const BCRYPT_ROUNDS = 12;
export const MIN_PASSWORD_LENGTH = 8;

export type Role = 'player' | 'owner';

/** What travels in the cookie: an id and a role, nothing sensitive. */
export interface SessionData {
  userId?: number;
  role?: Role;
}

/** The account as the database has it — the authority for every real check. */
export interface CurrentUser {
  id: number;
  name: string;
  role: Role;
}

const sessionPassword = process.env.SESSION_PASSWORD;
if (!sessionPassword || sessionPassword.length < 32) {
  // Failing loudly beats falling back to a built-in default: a known secret
  // means anyone can mint a valid session cookie for any account.
  throw new Error(
    'SESSION_PASSWORD is not set, or is shorter than 32 characters. See .env.local.example.'
  );
}

export const sessionOptions = {
  password: sessionPassword,
  cookieName: 'maidaan_session',
  // ttl and the cookie's max-age are kept in step by iron-session.
  ttl: 60 * 60 * 24 * 30, // 30 days
  cookieOptions: {
    // The point of the whole change: script on the page cannot read this.
    httpOnly: true,
    // Sent over HTTPS only in production; dev runs on plain http://localhost.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

/** Only a bcrypt digest is ever a valid stored password. */
function isBcryptHash(hash: string): boolean {
  return /^\$2[aby]?\$\d{2}\$/.test(hash);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Accounts migrated from before passwords existed carry an empty hash. That is
 * checked here rather than handed to bcrypt, so an unusable hash can never be
 * argued into matching.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash || !isBcryptHash(hash)) return false;
  return bcrypt.compare(plain, hash);
}

/**
 * The signed-in account, re-read from the database on every call.
 *
 * The role in the cookie is only an optimistic hint for proxy.ts. Real checks
 * use the row, so changing someone's role takes effect on their next request
 * instead of waiting for them to sign out.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session.userId) return null;

  const rows = await sql<{ id: number; name: string; role: Role }[]>`
    SELECT id, name, role FROM users WHERE id = ${session.userId}
  `;
  return rows[0] ?? null;
}

// Route handlers get a plain value back on success and a ready-made response on
// failure, so the check is impossible to write without also handling it:
//
//   const auth = await requireOwner();
//   if ('error' in auth) return auth.error;
//   auth.user.name  // <- only reachable once the check has passed
export type AuthResult = { user: CurrentUser } | { error: NextResponse };

const deny = (message: string, status: number) => ({
  error: NextResponse.json({ error: message }, { status }),
});

/** Signed in as anybody. Booking and joining games sit behind this. */
export async function requireUser(): Promise<AuthResult> {
  const user = await getCurrentUser();
  if (!user) return deny('Please sign in to continue.', 401);
  return { user };
}

/** Signed in *and* an owner account. Adding turfs, blocking slots, takings. */
export async function requireOwner(): Promise<AuthResult> {
  const auth = await requireUser();
  if ('error' in auth) return auth;
  if (auth.user.role !== 'owner') {
    return deny('This action is only available on a turf owner account.', 403);
  }
  return auth;
}

/**
 * An owner, and specifically the owner of this turf. Being an owner account is
 * not enough to touch someone else's calendar or takings.
 *
 * Ownership is still matched on name, but the name is now authenticated: it
 * comes from the session's account row, and lower(name) is unique across users,
 * so only one account can ever satisfy a given turf's owner_name.
 */
export async function requireTurfOwner(turfId: number): Promise<AuthResult> {
  const auth = await requireOwner();
  if ('error' in auth) return auth;

  const rows = await sql<{ owner_name: string }[]>`
    SELECT owner_name FROM turfs WHERE id = ${turfId}
  `;
  const turf = rows[0];
  if (!turf) return deny('Turf not found', 404);
  if (!sameName(turf.owner_name, auth.user.name)) {
    return deny('This turf belongs to someone else.', 403);
  }
  return auth;
}
