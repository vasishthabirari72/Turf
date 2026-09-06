import { NextRequest, NextResponse } from 'next/server';
import sql, { isUniqueConstraintError } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { isValidTime } from '@/lib/pricing';
import { isRazorpayConfigured, isValidPaymentSignature, razorpay } from '@/lib/razorpay';

const SLOT_TAKEN = 'This slot was just taken. Please pick another time.';

/**
 * Step 2 of a real payment: prove the payment happened, then create the slot.
 *
 * Verification and booking are deliberately the SAME request. The browser's
 * success callback is only a claim — a caller can post whatever it likes here —
 * so the slot is written only after the signature recomputes, and it is written
 * here rather than by a second call the client could simply skip.
 *
 * The signature is HMAC-SHA256("order_id|payment_id") under the key secret.
 * Getting it right requires the secret, which never leaves the server.
 *
 * What this still is not: a webhook. If the browser dies between Razorpay
 * taking the money and this call landing, the payment exists and the booking
 * does not. Razorpay's `payment.captured` webhook is the fix, and is the one
 * piece of production payment work left — see the README.
 */
export async function POST(req: NextRequest) {
  if (!isRazorpayConfigured()) {
    return NextResponse.json({ error: 'Online payment is not configured.' }, { status: 503 });
  }

  let body;
  try {
    body = await req.json();
    if (body === null || typeof body !== 'object') throw new Error('body is not an object');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const auth = await requireUser();
  if ('error' in auth) return auth.error;
  const customer_name = auth.user.name;

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    turf_id,
    date,
    start_time,
  } = body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: 'Missing payment details.' }, { status: 400 });
  }
  if (!turf_id || !date || !isValidTime(start_time)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // ---- the actual check -----------------------------------------------------
  if (!isValidPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    // Never mark anything paid on a mismatch. Log the ids (safe, and needed to
    // investigate) but never the signature or the secret.
    console.error('Razorpay signature mismatch', { razorpay_order_id, razorpay_payment_id });
    return NextResponse.json({ error: 'Payment could not be verified.' }, { status: 400 });
  }

  // A valid signature proves the payment is real, not that it is for THIS slot
  // or that it was actually captured. Re-read the order from Razorpay and check
  // both — otherwise a genuine ₹1 order for a cheap slot could be replayed
  // against an expensive one.
  const turfId = Number(turf_id);
  let orderAmountPaise: number;
  try {
    const order = await razorpay().orders.fetch(razorpay_order_id);
    if (order.status !== 'paid') {
      return NextResponse.json({ error: 'Payment is not complete.' }, { status: 400 });
    }
    const notes = (order.notes ?? {}) as Record<string, string>;
    if (
      notes.turf_id !== String(turfId) ||
      notes.date !== String(date) ||
      notes.start_time !== String(start_time) ||
      notes.user_id !== String(auth.user.id)
    ) {
      console.error('Razorpay order does not match the slot claimed', { razorpay_order_id });
      return NextResponse.json({ error: 'Payment could not be verified.' }, { status: 400 });
    }
    orderAmountPaise = Number(order.amount);
  } catch (err) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    console.error('Razorpay order fetch failed', { statusCode });
    return NextResponse.json({ error: 'Could not confirm the payment. Please contact us.' }, { status: 502 });
  }

  // ---- the payment is real; now take the slot -------------------------------
  const turfRows = await sql<{ id: number }[]>`SELECT id FROM turfs WHERE id = ${turfId}`;
  if (turfRows.length === 0) return NextResponse.json({ error: 'Turf not found' }, { status: 404 });

  // What was actually paid is what gets recorded, so the owner's takings can
  // never drift from the money that moved. The current rules are deliberately
  // NOT re-evaluated here: if a price changed between the order and the
  // capture, the amount the customer was charged is the true one.
  const paidRupees = Math.round(orderAmountPaise / 100);

  let insertedId: number;
  try {
    const inserted = await sql<{ id: number }[]>`
      INSERT INTO slot_overrides
        (turf_id, date, start_time, status, customer_name, payment_method, price, payment_id, order_id)
      VALUES
        (${turfId}, ${date}, ${start_time}, 'app_booking', ${customer_name}, 'razorpay',
         ${paidRupees}, ${razorpay_payment_id}, ${razorpay_order_id})
      RETURNING id
    `;
    insertedId = inserted[0].id;
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      // Two things land here. A replay of the same payment_id is idempotent:
      // return the booking that already exists rather than a scary error.
      const existing = await sql<{ id: number }[]>`
        SELECT id FROM slot_overrides WHERE payment_id = ${razorpay_payment_id}
      `;
      if (existing.length > 0) {
        return NextResponse.json({
          ok: true,
          already_recorded: true,
          booking: { id: existing[0].id, turf_id: turfId, date, start_time, customer_name, price: paidRupees },
        });
      }

      // The other case: someone else took the slot after the money was taken.
      // Say so plainly, with the payment id, because this one needs a refund.
      console.error('Paid for a slot that was taken first', { razorpay_payment_id });
      return NextResponse.json(
        {
          error: `${SLOT_TAKEN} Your payment will be refunded — quote ${razorpay_payment_id}.`,
          refund_required: true,
          payment_id: razorpay_payment_id,
        },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json(
    {
      ok: true,
      booking: {
        id: insertedId,
        turf_id: turfId,
        date,
        start_time,
        customer_name,
        payment_method: 'razorpay',
        price: paidRupees,
        payment_id: razorpay_payment_id,
      },
    },
    { status: 201 }
  );
}
