import postgres from 'postgres';
import { onnotice } from './schema.ts';

// Hosted Postgres, reached over DATABASE_URL. This replaced node:sqlite, which
// wrote to a local file and therefore could not work on a serverless host where
// the filesystem is read-only and per-instance.
//
// Schema creation and seeding deliberately do NOT happen here. A shared database
// must not have DDL run against it on every cold start or every request — see
// `npm run migrate` and `npm run seed`.

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.local.example to .env.local and put your ' +
      'Postgres connection string in it (see README).'
  );
}

// Next.js reloads modules in dev; without a singleton every reload would open a
// fresh pool and eventually exhaust the connection limit.
const globalForDb = globalThis as unknown as { __turfSql?: ReturnType<typeof postgres> };

const sql =
  globalForDb.__turfSql ??
  postgres(connectionString, {
    // Serverless functions are short-lived and numerous; a large pool per
    // instance is how you run a hosted Postgres out of connections.
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__turfSql = sql;
}

// Postgres reports a unique violation as SQLSTATE 23505 — the SQLite codes this
// used to check (2067 / 1555) never appear here. The message fallback covers a
// driver that surfaces the error without a code.
const PG_UNIQUE_VIOLATION = '23505';

export function isUniqueConstraintError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const { code } = err as Error & { code?: string };
  if (code === PG_UNIQUE_VIOLATION) return true;
  return /duplicate key value violates unique constraint/i.test(err.message);
}

export default sql;
