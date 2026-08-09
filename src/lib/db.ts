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
  photo_emoji TEXT DEFAULT '⚽',
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

// Seed data only if empty
const turfCount = (db.prepare('SELECT COUNT(*) as c FROM turfs').get() as { c: number }).c;

if (turfCount === 0) {
  const insertTurf = db.prepare(`
    INSERT INTO turfs (name, owner_name, locality, sport, price_per_hour, open_time, close_time, photo_emoji, rating)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const turfs = [
    ['Green Arena Box Cricket', 'Ramesh Patil', 'Andheri West', 'Cricket', 800, '06:00', '23:00', '🏏', 4.6],
    ['Kickoff Turf', 'Suresh Nair', 'Andheri West', 'Football', 1000, '06:00', '23:30', '⚽', 4.3],
    ['Ace Badminton Court', 'Priya Shah', 'Andheri East', 'Badminton', 500, '06:00', '22:00', '🏸', 4.8],
    ['Champions Football Ground', 'Vikram Singh', 'Andheri East', 'Football', 1200, '05:30', '23:00', '⚽', 4.4],
    ['Striker\'s Box Cricket', 'Anil Kumar', 'Jogeshwari', 'Cricket', 700, '07:00', '22:30', '🏏', 4.1],
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
