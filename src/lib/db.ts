import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = path.join(process.cwd(), 'turf.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS turfs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  locality TEXT NOT NULL,
  sport TEXT NOT NULL,
  price_per_hour INTEGER NOT NULL,
  open_time TEXT NOT NULL DEFAULT '06:00',
  close_time TEXT NOT NULL DEFAULT '23:00',
  photo_emoji TEXT DEFAULT '⚽', -- fallback when there is no photo
  photo_url TEXT,                -- e.g. '/turf-photos/xyz.jpg', NULL if none
  rating REAL DEFAULT 4.5,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS slot_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turf_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  status TEXT NOT NULL, -- 'app_booking' | 'manual_block'
  note TEXT,
  customer_name TEXT,
  -- 'card' | 'upi' | 'cod' for app bookings; NULL for manual blocks and for
  -- bookings made before this column existed. 'cod' means the owner still has
  -- to collect the money in person, which is why the calendar flags it.
  payment_method TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (turf_id) REFERENCES turfs(id)
);

-- The database is the source of truth for slot exclusivity. Application-level
-- check-then-insert leaves a race window between the SELECT and the INSERT;
-- this index closes it by rejecting the second writer outright.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_slot ON slot_overrides(turf_id, date, start_time);

-- Peak/off-peak pricing. A rule covers slots where start_time <= slot < end_time.
-- Hours not covered by any rule fall back to turfs.price_per_hour, so adding
-- rules is additive and a turf with none behaves exactly as before.
CREATE TABLE IF NOT EXISTS pricing_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turf_id INTEGER NOT NULL,
  start_time TEXT NOT NULL,  -- e.g. '18:00'
  end_time TEXT NOT NULL,    -- e.g. '22:00'
  price INTEGER NOT NULL,
  FOREIGN KEY (turf_id) REFERENCES turfs(id)
);

-- Saved details so returning people don't retype their name and number.
-- This is NOT authentication: there is no password, session or identity check
-- anywhere in this app, and a phone number here is simply stored as typed.
-- Identity stays name-based, exactly as it is everywhere else.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT, -- 'player' | 'owner' | 'both', just informational
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_name TEXT NOT NULL,
  sport TEXT NOT NULL,
  locality TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  players_needed INTEGER NOT NULL,
  players_joined TEXT NOT NULL DEFAULT '[]', -- JSON array — approved players
  pending_joiners TEXT NOT NULL DEFAULT '[]', -- JSON array — awaiting creator approval
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'full'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// CREATE TABLE IF NOT EXISTS is a no-op on databases created before pending_joiners
// existed, so add the column separately for those. Without this, every query
// touching pending_joiners fails on an already-seeded turf.db.
const playerRequestColumns = db.prepare('PRAGMA table_info(player_requests)').all() as { name: string }[];
if (!playerRequestColumns.some((c) => c.name === 'pending_joiners')) {
  db.exec(`ALTER TABLE player_requests ADD COLUMN pending_joiners TEXT NOT NULL DEFAULT '[]'`);
}

// Same story for payment_method — nullable, so existing rows stay valid.
const slotOverrideColumns = db.prepare('PRAGMA table_info(slot_overrides)').all() as { name: string }[];
if (!slotOverrideColumns.some((c) => c.name === 'payment_method')) {
  db.exec(`ALTER TABLE slot_overrides ADD COLUMN payment_method TEXT`);
}

// The price a booking was actually made at. Stored so that changing a pricing
// rule later never rewrites what an existing booking cost. NULL for manual
// blocks and for bookings made before this column existed.
if (!slotOverrideColumns.some((c) => c.name === 'price')) {
  db.exec(`ALTER TABLE slot_overrides ADD COLUMN price INTEGER`);
}

// And photo_url — turfs listed before photos existed keep their emoji.
const turfColumns = db.prepare('PRAGMA table_info(turfs)').all() as { name: string }[];
if (!turfColumns.some((c) => c.name === 'photo_url')) {
  db.exec(`ALTER TABLE turfs ADD COLUMN photo_url TEXT`);
}

// Seed data only if empty
const turfCount = (db.prepare('SELECT COUNT(*) as c FROM turfs').get() as { c: number }).c;

if (turfCount === 0) {
  const insertTurf = db.prepare(`
    INSERT INTO turfs (name, owner_name, locality, sport, price_per_hour, open_time, close_time, photo_emoji, rating, photo_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Three seed turfs carry a photo and two deliberately don't, so both the photo
  // and the emoji fallback are visible side by side in a fresh demo. These are
  // hand-drawn SVG illustrations in the app's palette, not stock photography.
  const turfs = [
    ['Green Arena Box Cricket', 'Ramesh Patil', 'Andheri West', 'Cricket', 800, '06:00', '23:00', '🏏', 4.6, '/turf-photos/seed-cricket.svg'],
    ['Kickoff Turf', 'Suresh Nair', 'Andheri West', 'Football', 1000, '06:00', '23:30', '⚽', 4.3, '/turf-photos/seed-football.svg'],
    ['Ace Badminton Court', 'Priya Shah', 'Andheri East', 'Badminton', 500, '06:00', '22:00', '🏸', 4.8, '/turf-photos/seed-badminton.svg'],
    ['Champions Football Ground', 'Vikram Singh', 'Andheri East', 'Football', 1200, '05:30', '23:00', '⚽', 4.4, null],
    ['Striker\'s Box Cricket', 'Anil Kumar', 'Jogeshwari', 'Cricket', 700, '07:00', '22:30', '🏏', 4.1, null],
  ];

  for (const t of turfs) insertTurf.run(...t);

  const insertOverride = db.prepare(`
    INSERT INTO slot_overrides (turf_id, date, start_time, status, note, customer_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const todayStr = fmt(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = fmt(tomorrow);

  // Some app bookings
  insertOverride.run(1, todayStr, '18:00', 'app_booking', null, 'Arjun Mehta');
  insertOverride.run(1, todayStr, '19:00', 'app_booking', null, 'Rohan Desai');
  insertOverride.run(2, todayStr, '20:00', 'app_booking', null, 'Karan Joshi');
  insertOverride.run(3, tomorrowStr, '07:00', 'app_booking', null, 'Sneha Rao');
  // Some manual (phone/walk-in) blocks — the feature we just discussed
  insertOverride.run(1, todayStr, '20:00', 'manual_block', 'Phone booking', null);
  insertOverride.run(2, todayStr, '18:00', 'manual_block', 'Regular customer', null);
  insertOverride.run(4, tomorrowStr, '19:00', 'manual_block', 'Walk-in', null);

  const insertRequest = db.prepare(`
    INSERT INTO player_requests (creator_name, sport, locality, date, time, players_needed, players_joined, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertRequest.run('Aditya K.', 'Football', 'Andheri West', tomorrowStr, '19:00', 4, JSON.stringify(['Rohit S.']), 'open');
  insertRequest.run('Meera J.', 'Badminton', 'Andheri East', todayStr, '17:30', 1, JSON.stringify([]), 'open');
  insertRequest.run('Farhan A.', 'Cricket', 'Jogeshwari', tomorrowStr, '08:00', 6, JSON.stringify(['Zaid', 'Imran', 'Vivek']), 'open');
}

// node:sqlite tags every failure with the generic code 'ERR_SQLITE_ERROR' and puts
// the specific reason in `errcode` — so matching on `code` would never fire. 2067 is
// SQLITE_CONSTRAINT_UNIQUE (a unique index); 1555 is SQLITE_CONSTRAINT_PRIMARYKEY.
const SQLITE_CONSTRAINT_UNIQUE = 2067;
const SQLITE_CONSTRAINT_PRIMARYKEY = 1555;

export function isUniqueConstraintError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const { errcode } = err as Error & { errcode?: number };
  if (errcode === SQLITE_CONSTRAINT_UNIQUE || errcode === SQLITE_CONSTRAINT_PRIMARYKEY) {
    return true;
  }
  return /UNIQUE constraint failed/i.test(err.message);
}

export default db;
