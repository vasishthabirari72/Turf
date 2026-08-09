import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// ---------------------------------------------------------------------------
// LOCAL DEMO UPLOADS — writes straight to public/turf-photos on this machine.
// There is no object storage here on purpose.
//
// TODO before this is used anywhere real: move to S3/Cloudinary/UploadThing.
// Writing into public/ only works because the app runs from a normal disk; on a
// serverless host the filesystem is read-only (and per-instance), so uploads
// would fail or vanish — the same constraint that keeps the SQLite database
// local. See the deployment note in README.md.
// ---------------------------------------------------------------------------

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Raster formats only. SVG is deliberately excluded: it can carry <script>, and
// these files are served from our own origin, so accepting one would hand any
// uploader stored XSS on the app's domain.
const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'turf-photos');

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file received.' }, { status: 400 });
  }

  const ext = ALLOWED[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: 'Please upload a JPG, PNG or WebP image.' },
      { status: 415 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That photo is too large. Please keep it under ${MAX_BYTES / (1024 * 1024)}MB.` },
      { status: 413 }
    );
  }

  // The client's filename is never used — it is attacker-controlled and could
  // contain path separators or "..". We generate our own, so the write can only
  // ever land inside UPLOAD_DIR.
  const filename = `upload-${randomUUID()}${ext}`;

  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, filename), Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: 'Could not save that photo. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ url: `/turf-photos/${filename}` }, { status: 201 });
}
