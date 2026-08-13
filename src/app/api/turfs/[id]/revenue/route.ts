import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { normalizeName, sameName } from '@/lib/names';

// What the owner actually took, from both halves of the business: bookings made
// through the app and phone/walk-in bookings they blocked by hand. This is the
// only endpoint that exposes the amount recorded against a manual block — those
// figures are the owner's takings, so /api/slots deliberately does not return
// them.
//
// Slots with no amount recorded are counted separately rather than summed as
// zero. An owner who has skipped the field should see the gap, not a total that
// quietly understates their day.

const DAYS = 7;

interface Row {
  date: string;
  status: string;
  total: number;
  counted: number;
  not_recorded: number;
}

function emptyDay(date: string) {
  return {
    date,
    app: { total: 0, count: 0 },
    manual: { total: 0, count: 0 },
    notRecorded: 0,
    total: 0,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actingAs = new URL(req.url).searchParams.get('acting_as') || '';

  const turfId = Number(id);
  if (!Number.isInteger(turfId)) {
    return NextResponse.json({ error: 'Turf not found' }, { status: 404 });
  }
  if (!normalizeName(actingAs)) {
    return NextResponse.json({ error: 'acting_as is required' }, { status: 400 });
  }

  const turfRows = await sql<{ owner_name: string; name: string }[]>`
    SELECT owner_name, name FROM turfs WHERE id = ${turfId}
  `;
  if (turfRows.length === 0) return NextResponse.json({ error: 'Turf not found' }, { status: 404 });

  // Same check as everywhere else: only the turf's owner sees its numbers.
  if (!sameName(turfRows[0].owner_name, actingAs)) {
    return NextResponse.json({ error: "Only this turf's owner can see its collection" }, { status: 403 });
  }

  // UTC, matching how every date in this app is produced and compared.
  const todayStr = new Date().toISOString().split('T')[0];
  const dates: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    dates.push(new Date(Date.now() - i * 86400000).toISOString().split('T')[0]);
  }
  const from = dates[0];

  const rows = await sql<Row[]>`
    SELECT date,
           status,
           COALESCE(SUM(price), 0)::int                        AS total,
           COUNT(*) FILTER (WHERE price IS NOT NULL)::int       AS counted,
           COUNT(*) FILTER (WHERE price IS NULL)::int           AS not_recorded
      FROM slot_overrides
     WHERE turf_id = ${turfId}
       AND date >= ${from}
       AND date <= ${todayStr}
     GROUP BY date, status
  `;

  const byDate = new Map(dates.map((d) => [d, emptyDay(d)]));
  for (const r of rows) {
    const day = byDate.get(r.date);
    if (!day) continue;
    const bucket = r.status === 'app_booking' ? day.app : day.manual;
    bucket.total += r.total;
    bucket.count += r.counted;
    day.notRecorded += r.not_recorded;
    day.total += r.total;
  }

  // Most recent first — the owner cares about today.
  const days = dates.map((d) => byDate.get(d)!).reverse();

  return NextResponse.json({
    turf: { id: turfId, name: turfRows[0].name },
    today: byDate.get(todayStr) ?? emptyDay(todayStr),
    days,
  });
}
