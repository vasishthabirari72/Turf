import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// ---------------------------------------------------------------------------
// !! KNOWN BROKEN ON VERCEL — READ THIS BEFORE DEPLOYING !!
//
// This route writes uploaded files to public/turf-photos on the local disk.
// The database was moved to hosted Postgres precisely because a local file
// cannot work on a serverless host; THIS ROUTE STILL HAS THAT EXACT PROBLEM and
// was deliberately left as-is rather than silently half-fixed.
//
// What happens on Vercel: the filesystem is read-only apart from /tmp, so
// writeFile below throws and the owner sees "Could not save that photo".
// Even if it were pointed at /tmp, that directory is per-instance and wiped, so
// the file would not be servable at /turf-photos/... afterwards.
//
// What still works on Vercel: everything else. Turfs without a photo fall back
// to the emoji, and the three committed seed-*.svg files are part of the build
// output, so seeded turfs keep their pictures. Only *new* uploads fail.
//
// TODO: move to object storage (Vercel Blob is the smallest change here —
// `put()` returns a public URL; Cloudinary or UploadThing work too). The route
// keeps its shape: validate, store, return { url }. The turfs API already
// restricts photo_url to a path we produced, so that check needs widening to
// the storage host at the same time.
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
