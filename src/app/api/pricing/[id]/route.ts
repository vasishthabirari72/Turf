import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
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

  const rule = db.prepare('SELECT turf_id FROM pricing_rules WHERE id = ?').get(id) as
    | { turf_id: number }
    | undefined;
  if (!rule) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

  const turf = db.prepare('SELECT owner_name FROM turfs WHERE id = ?').get(rule.turf_id) as
    | { owner_name: string }
    | undefined;
  if (!turf || !sameName(turf.owner_name, acting_as)) {
    return NextResponse.json({ error: "Only this turf's owner can change its prices" }, { status: 403 });
  }

  db.prepare('DELETE FROM pricing_rules WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
