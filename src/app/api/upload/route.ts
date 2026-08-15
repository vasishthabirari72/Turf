import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { put } from '@vercel/blob';
import { requireOwner } from '@/lib/auth';

// Turf photos go to Vercel Blob, which is object storage that outlives the
// request. This route used to write to public/turf-photos on the local disk,
// which cannot work on a serverless host: the filesystem is read-only apart
// from /tmp, and /tmp is per-instance and wiped, so the file would not be
// servable afterwards even if the write succeeded. In production that meant an
// owner who picked a photo could not list their turf at all.
//
// The disk path is kept only as a fallback for running without a blob token
// (a fresh clone, or offline). Anything deployed has the token, so anything
// deployed uses Blob.
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
  // Uploading a turf photo is an owner action, and an unauthenticated write
  // endpoint that puts files on disk is worth closing regardless.
  const auth = await requireOwner();
  if ('error' in auth) return auth.error;

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
  // contain path separators or "..". We generate our own, so the stored object
  // can only ever land where we intend.
  const filename = `upload-${randomUUID()}${ext}`;

  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`turf-photos/${filename}`, file, {
        access: 'public',
        // The name is already a UUID, so a suffix would only make the URL
        // harder to read; addRandomSuffix would also make the stored path
        // differ from the one we asked for.
        addRandomSuffix: false,
        // Photos are immutable once written — a new upload gets a new name.
        cacheControlMaxAge: 31536000,
        contentType: file.type,
      });
      return NextResponse.json({ url: blob.url }, { status: 201 });
    }

    // No token: local disk, which only works when there is a real filesystem.
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, filename), Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ url: `/turf-photos/${filename}` }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Could not save that photo. Please try again.' }, { status: 500 });
  }
}
