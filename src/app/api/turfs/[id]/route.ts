import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const turf = db.prepare('SELECT * FROM turfs WHERE id = ?').get(id);
  if (!turf) return NextResponse.json({ error: 'Turf not found' }, { status: 404 });
  return NextResponse.json(turf);
}
