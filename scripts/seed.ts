// One-time demo data. Runs the schema migration first, then inserts sample rows
// only if the database is empty.
//   npm run seed          -- refuses if turfs already exist
//   npm run seed -- --force  -- wipes demo tables first, then reseeds
//
// This used to run automatically whenever the local SQLite file was created.
// Against a shared hosted database that would be wrong: every deploy, and in
// serverless every cold start, would try to reseed live data.
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { migrate, onnotice } from '../src/lib/schema.ts';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. See .env.local.example.');
  process.exit(1);
}

const force = process.argv.includes('--force');
const sql = postgres(connectionString, { max: 1, onnotice });

const fmt = (d: Date) => d.toISOString().split('T')[0];
const today = new Date();
const todayStr = fmt(today);
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowStr = fmt(tomorrow);

try {
  await migrate(sql);

  const [{ count }] = await sql<{ count: string }[]>`SELECT COUNT(*)::int AS count FROM turfs`;
  const existing = Number(count);

  if (existing > 0 && !force) {
    console.log(
      `Database already has ${existing} turf(s) — not reseeding.\n` +
        'Re-run with `npm run seed -- --force` to wipe the demo tables and start over.'
    );
    await sql.end();
    process.exit(0);
  }

  if (force) {
    // TRUNCATE rather than DELETE, and RESTART IDENTITY specifically: DELETE
    // leaves the identity sequences where they were, so a reseed would hand the
    // turfs fresh ids (6, 7, 8...) and every existing /turf/1 link would 404.
    // CASCADE covers slot_overrides and pricing_rules referencing turfs.
    await sql`TRUNCATE turfs, slot_overrides, pricing_rules, player_requests RESTART IDENTITY CASCADE`;
    console.log('Cleared existing demo data.');
  }

  // Three seed turfs carry a photo and two deliberately do not, so both the
  // photo and the emoji fallback are visible side by side in a fresh demo.
  // These are hand-drawn SVG illustrations, not stock photography.
  const turfs = [
    ['Green Arena Box Cricket', 'Ramesh Patil', 'Andheri West', 'Cricket', 800, '06:00', '23:00', '🏏', 4.6, '/turf-photos/seed-cricket.svg'],
    ['Kickoff Turf', 'Suresh Nair', 'Andheri West', 'Football', 1000, '06:00', '23:30', '⚽', 4.3, '/turf-photos/seed-football.svg'],
    ['Ace Badminton Court', 'Priya Shah', 'Andheri East', 'Badminton', 500, '06:00', '22:00', '🏸', 4.8, '/turf-photos/seed-badminton.svg'],
    ['Champions Football Ground', 'Vikram Singh', 'Andheri East', 'Football', 1200, '05:30', '23:00', '⚽', 4.4, null],
    ["Striker's Box Cricket", 'Anil Kumar', 'Jogeshwari', 'Cricket', 700, '07:00', '22:30', '🏏', 4.1, null],
  ] as const;

  // Every seeded turf needs a real account behind it, or its calendar and
  // takings are unreachable: ownership is now decided by the signed-in account
  // matching turfs.owner_name, and there is no way to sign in without a
  // password. The demo password is intentionally not a secret — these are
  // sample accounts in a sample database.
  //
  // Seeding the accounts also takes the names, so nobody can register as
  // "Ramesh Patil" and inherit his turf.
  const DEMO_PASSWORD = 'demo-turf-2026';
  const demoHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const owners = [...new Set(turfs.map((t) => t[1]))];
  for (const owner of owners) {
    await sql`
      INSERT INTO users (name, role, password_hash)
      VALUES (${owner}, 'owner', ${demoHash})
      ON CONFLICT (name) DO UPDATE SET role = 'owner', password_hash = ${demoHash}
    `;
  }
  // One sample player, so the non-owner side of the demo has an account too.
  await sql`
    INSERT INTO users (name, role, password_hash)
    VALUES ('Aditya K.', 'player', ${demoHash})
    ON CONFLICT (name) DO UPDATE SET role = 'player', password_hash = ${demoHash}
  `;

  const turfIds: number[] = [];
  for (const t of turfs) {
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO turfs (name, owner_name, locality, sport, price_per_hour, open_time, close_time, photo_emoji, rating, photo_url)
      VALUES (${t[0]}, ${t[1]}, ${t[2]}, ${t[3]}, ${t[4]}, ${t[5]}, ${t[6]}, ${t[7]}, ${t[8]}, ${t[9]})
      RETURNING id
    `;
    turfIds.push(row.id);
  }

  // Indexes here are into turfIds, so this works whatever ids Postgres assigns.
  const overrides: [number, string, string, string, string | null, string | null][] = [
    [turfIds[0], todayStr, '18:00', 'app_booking', null, 'Arjun Mehta'],
    [turfIds[0], todayStr, '19:00', 'app_booking', null, 'Rohan Desai'],
    [turfIds[1], todayStr, '20:00', 'app_booking', null, 'Karan Joshi'],
    [turfIds[2], tomorrowStr, '07:00', 'app_booking', null, 'Sneha Rao'],
    [turfIds[0], todayStr, '20:00', 'manual_block', 'Phone booking', null],
    [turfIds[1], todayStr, '18:00', 'manual_block', 'Regular customer', null],
    [turfIds[3], tomorrowStr, '19:00', 'manual_block', 'Walk-in', null],
  ];
  for (const [turfId, date, start, status, note, customer] of overrides) {
    await sql`
      INSERT INTO slot_overrides (turf_id, date, start_time, status, note, customer_name)
      VALUES (${turfId}, ${date}, ${start}, ${status}, ${note}, ${customer})
    `;
  }

  const requests: [string, string, string, string, string, number, string, string][] = [
    ['Aditya K.', 'Football', 'Andheri West', tomorrowStr, '19:00', 4, JSON.stringify(['Rohit S.']), 'open'],
    ['Meera J.', 'Badminton', 'Andheri East', todayStr, '17:30', 1, JSON.stringify([]), 'open'],
    ['Farhan A.', 'Cricket', 'Jogeshwari', tomorrowStr, '08:00', 6, JSON.stringify(['Zaid', 'Imran', 'Vivek']), 'open'],
  ];
  for (const [creator, sport, locality, date, time, needed, joined, status] of requests) {
    await sql`
      INSERT INTO player_requests (creator_name, sport, locality, date, time, players_needed, players_joined, status)
      VALUES (${creator}, ${sport}, ${locality}, ${date}, ${time}, ${needed}, ${joined}, ${status})
    `;
  }

  console.log(
    `Seeded ${turfs.length} turfs, ${overrides.length} slot overrides and ${requests.length} player requests.`
  );
  console.log(
    `Demo accounts (password "${DEMO_PASSWORD}"): ${owners.join(', ')} as owners, Aditya K. as a player.`
  );
} catch (err) {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
