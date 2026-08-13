import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { priceForSlot, type PricingRule } from '@/lib/pricing';

interface Turf {
  id: number;
  open_time: string;
  close_time: string;
  price_per_hour: number;
}

interface Override {
  start_time: string;
  status: string;
  note: string | null;
  customer_name: string | null;
  payment_method: string | null;
  price: number | null;
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
  const turfIdParam = searchParams.get('turf_id');
  const date = searchParams.get('date');

  if (!turfIdParam || !date) {
    return NextResponse.json({ error: 'turf_id and date are required' }, { status: 400 });
  }

  // Postgres compares an integer column against a typed parameter, so a
  // non-numeric turf_id must be rejected here rather than reaching the query.
  const turfId = Number(turfIdParam);
  if (!Number.isInteger(turfId)) {
    return NextResponse.json({ error: 'turf_id must be a number' }, { status: 400 });
  }

  const turfRows = await sql<Turf[]>`SELECT * FROM turfs WHERE id = ${turfId}`;
  if (turfRows.length === 0) return NextResponse.json({ error: 'Turf not found' }, { status: 404 });
  const turf = turfRows[0];

  const overrides = await sql<Override[]>`
    SELECT start_time, status, note, customer_name, payment_method, price
      FROM slot_overrides
     WHERE turf_id = ${turfId} AND date = ${date}
  `;

  const overrideMap = new Map(overrides.map((o) => [o.start_time, o]));

  // Peak/off-peak rules for this turf; hours they don't cover use the turf's
  // flat price_per_hour.
  const rules = await sql<PricingRule[]>`
    SELECT id, turf_id, start_time, end_time, price FROM pricing_rules WHERE turf_id = ${turfId}
  `;

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
      payment_method: override?.payment_method || null,
      // What this hour costs. An app booking keeps the price it was made at, so
      // a later rule change never rewrites it.
      //
      // A manual block's stored price is what the OWNER collected in cash, and
      // this endpoint is public — exposing it would publish their takings to
      // anyone browsing the turf. Blocked hours therefore show the ordinary list
      // price; the recorded amount is only returned by the ownership-checked
      // revenue endpoint.
      price:
        override?.status === 'app_booking' && override.price != null
          ? override.price
          : priceForSlot(time, rules, turf.price_per_hour),
    });
  }

  return NextResponse.json({ turf, date, slots });
}
