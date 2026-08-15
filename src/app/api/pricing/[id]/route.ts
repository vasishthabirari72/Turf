import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { requireTurfOwner } from '@/lib/auth';

// Delete a pricing rule. Ownership is checked against the rule's turf before
// anything is removed.
// The request carries no body at all now: it used to exist only to smuggle an
// acting_as name, and who you are comes from the session cookie instead.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ruleId = Number(id);
  if (!Number.isInteger(ruleId)) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  const ruleRows = await sql<{ turf_id: number }[]>`
    SELECT turf_id FROM pricing_rules WHERE id = ${ruleId}
  `;
  if (ruleRows.length === 0) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

  // The rule names the turf; the session has to match that turf's owner.
  const auth = await requireTurfOwner(ruleRows[0].turf_id);
  if ('error' in auth) return auth.error;

  await sql`DELETE FROM pricing_rules WHERE id = ${ruleId}`;
  return NextResponse.json({ ok: true });
}
