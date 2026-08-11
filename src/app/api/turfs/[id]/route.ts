import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const turfId = Number(id);
  if (!Number.isInteger(turfId)) {
    return NextResponse.json({ error: 'Turf not found' }, { status: 404 });
  }

  const rows = await sql`SELECT * FROM turfs WHERE id = ${turfId}`;
  if (rows.length === 0) return NextResponse.json({ error: 'Turf not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}
