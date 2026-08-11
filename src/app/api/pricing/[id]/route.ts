import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { normalizeName, sameName } from '@/lib/names';

// Delete a pricing rule. Ownership is checked against the rule's turf before
// anything is removed.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body;
  try {
    body = await req.json();
    if (body === null || typeof body !== 'object') throw new Error('body is not an object');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { acting_as } = body;
  if (typeof acting_as !== 'string' || !normalizeName(acting_as)) {
    return NextResponse.json({ error: 'acting_as is required' }, { status: 400 });
  }

  const ruleId = Number(id);
  if (!Number.isInteger(ruleId)) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  const ruleRows = await sql<{ turf_id: number }[]>`
    SELECT turf_id FROM pricing_rules WHERE id = ${ruleId}
  `;
  if (ruleRows.length === 0) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

  const turfRows = await sql<{ owner_name: string }[]>`
    SELECT owner_name FROM turfs WHERE id = ${ruleRows[0].turf_id}
  `;
  if (turfRows.length === 0 || !sameName(turfRows[0].owner_name, acting_as)) {
    return NextResponse.json({ error: "Only this turf's owner can change its prices" }, { status: 403 });
  }

  await sql`DELETE FROM pricing_rules WHERE id = ${ruleId}`;
  return NextResponse.json({ ok: true });
}
