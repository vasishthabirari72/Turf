import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

interface Turf {
  id: number;
  open_time: string;
  close_time: string;
}

interface Override {
  start_time: string;
  status: string;
  note: string | null;
  customer_name: string | null;
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(m: number) {
  const h = Math.floor(m / 60)
    .toString()
    .padStart(2, '0');
  const min = (m % 60).toString().padStart(2, '0');
  return `${h}:${min}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const turfId = searchParams.get('turf_id');
  const date = searchParams.get('date');

  if (!turfId || !date) {
    return NextResponse.json({ error: 'turf_id and date are required' }, { status: 400 });
  }

  const turf = db.prepare('SELECT * FROM turfs WHERE id = ?').get(turfId) as Turf | undefined;
  if (!turf) return NextResponse.json({ error: 'Turf not found' }, { status: 404 });

  const overrides = db
    .prepare('SELECT start_time, status, note, customer_name FROM slot_overrides WHERE turf_id = ? AND date = ?')
    .all(turfId, date) as unknown as Override[];

  const overrideMap = new Map(overrides.map((o) => [o.start_time, o]));

  const slots = [];
  const start = timeToMinutes(turf.open_time);
  const end = timeToMinutes(turf.close_time);

  for (let m = start; m < end; m += 60) {
    const time = minutesToTime(m);
    const override = overrideMap.get(time);
    slots.push({
      time,
      status: override ? override.status : 'open',
      note: override?.note || null,
      customer_name: override?.customer_name || null,
    });
  }

  return NextResponse.json({ turf, date, slots });
}
