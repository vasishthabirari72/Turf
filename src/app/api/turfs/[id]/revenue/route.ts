import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { requireTurfOwner } from '@/lib/auth';

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const turfId = Number(id);
  if (!Number.isInteger(turfId)) {
    return NextResponse.json({ error: 'Turf not found' }, { status: 404 });
  }

  // Only the turf's owner sees its takings, proven by the session rather than
  // by an acting_as query parameter — that parameter was a URL anyone could
  // type, which for the most sensitive figures in the app was the weakest
  // possible check.
  const auth = await requireTurfOwner(turfId);
  if ('error' in auth) return auth.error;

  const turfRows = await sql<{ owner_name: string; name: string }[]>`
    SELECT owner_name, name FROM turfs WHERE id = ${turfId}
  `;
  if (turfRows.length === 0) return NextResponse.json({ error: 'Turf not found' }, { status: 404 });

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

  // "What did I make this month" is the question an owner actually asks, and
  // seven days cannot answer it. Both periods are calendar-based (this month so
  // far, this year so far) rather than rolling windows, because that is what
  // "this month" means to someone reconciling a register.
  //
  // Dates are TEXT in 'YYYY-MM-DD' form throughout this app, so a prefix
  // comparison is both correct and index-friendly — no date parsing in SQL.
  const monthPrefix = todayStr.slice(0, 7); // YYYY-MM
  const yearPrefix = todayStr.slice(0, 4);  // YYYY

  const periodRows = await sql<{ period: string; status: string; total: number; counted: number; not_recorded: number }[]>`
    SELECT CASE WHEN date LIKE ${monthPrefix + '%'} THEN 'month' ELSE 'year' END AS period,
           status,
           COALESCE(SUM(price), 0)::int                   AS total,
           COUNT(*) FILTER (WHERE price IS NOT NULL)::int  AS counted,
           COUNT(*) FILTER (WHERE price IS NULL)::int      AS not_recorded
      FROM slot_overrides
     WHERE turf_id = ${turfId}
       AND date LIKE ${yearPrefix + '%'}
       AND date <= ${todayStr}
     GROUP BY period, status
  `;

  // A row in the current month counts towards the year as well, so the year
  // figure is the sum of both buckets rather than the 'year' bucket alone.
  const month = emptyDay(monthPrefix);
  const year = emptyDay(yearPrefix);
  for (const r of periodRows) {
    for (const target of r.period === 'month' ? [month, year] : [year]) {
      const bucket = r.status === 'app_booking' ? target.app : target.manual;
      bucket.total += r.total;
      bucket.count += r.counted;
      target.notRecorded += r.not_recorded;
      target.total += r.total;
    }
  }

  return NextResponse.json({
    turf: { id: turfId, name: turfRows[0].name },
    today: byDate.get(todayStr) ?? emptyDay(todayStr),
    days,
    month: { ...month, label: new Date(`${todayStr}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) },
    year: { ...year, label: yearPrefix },
  });
}
