// Creates the schema and applies column migrations. Idempotent — safe to re-run.
//   npm run migrate
import postgres from 'postgres';
import { migrate, onnotice } from '../src/lib/schema.ts';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. See .env.local.example.');
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1, onnotice });

try {
  await migrate(sql);
  console.log('Schema is up to date.');
} catch (err) {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
