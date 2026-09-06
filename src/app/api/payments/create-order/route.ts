import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { priceForSlot, isValidTime, type PricingRule } from '@/lib/pricing';
import {
  isRazorpayConfigured,
  isTestMode,
  razorpay,
  rupeesToPaise,
  MIN_AMOUNT_PAISE,
} from '@/lib/razorpay';

/**
 * Step 1 of a real payment: ask Razorpay for an order, and get back an id that
 * Checkout opens against.
 *
 * The amount is NOT taken from the request body. It is looked up from the turf
 * and the pricing rules with the same `priceForSlot` the booking route uses, so
 * the price quoted here, the price charged, and the price recorded are the same
 * number. Trusting a client-sent amount would let anyone book a ₹1200 peak slot
 * for ₹1 — the client is asked *which slot*, never *how much*.
 *
 * Nothing is reserved here. The slot is still created only by /api/bookings,
 * after the signature has been verified.
 */
export async function POST(req: NextRequest) {
  if (!isRazorpayConfigured()) {
    // The checkout falls back to the mock sheet on this, so a clone with no
    // Razorpay account still demos end to end.
    return NextResponse.json({ error: 'Online payment is not configured.' }, { status: 503 });
  }

  let body;
  try {
    body = await req.json();
    if (body === null || typeof body !== 'object') throw new Error('body is not an object');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Paying requires being signed in, exactly like booking: an order is tied to
  // the account that will hold the slot.
  const auth = await requireUser();
  if ('error' in auth) return auth.error;

  const { turf_id, date, start_time } = body;

  if (!turf_id || !date || !start_time) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!isValidTime(start_time)) {
    return NextResponse.json({ error: 'Invalid slot time' }, { status: 400 });
  }

  const turfId = Number(turf_id);
  if (!Number.isInteger(turfId)) {
    return NextResponse.json({ error: 'Turf not found' }, { status: 404 });
  }

  const turfRows = await sql<{ name: string; price_per_hour: number }[]>`
    SELECT name, price_per_hour FROM turfs WHERE id = ${turfId}
  `;
  if (turfRows.length === 0) {
    return NextResponse.json({ error: 'Turf not found' }, { status: 404 });
  }

  // Fail before charging anyone for a slot that is already gone. This is a
  // courtesy check, not the guarantee — /api/bookings and its unique index
  // still decide, and a race here surfaces as a refund-worthy 409 there.
  const taken = await sql<{ id: number }[]>`
    SELECT id FROM slot_overrides
     WHERE turf_id = ${turfId} AND date = ${date} AND start_time = ${start_time}
  `;
  if (taken.length > 0) {
    return NextResponse.json(
      { error: 'This slot was just taken. Please pick another time.' },
      { status: 409 }
    );
  }

  const rules = await sql<PricingRule[]>`
    SELECT id, turf_id, start_time, end_time, price FROM pricing_rules WHERE turf_id = ${turfId}
  `;
  const rupees = priceForSlot(start_time, rules, turfRows[0].price_per_hour);
  const amount = rupeesToPaise(rupees);

  if (amount < MIN_AMOUNT_PAISE) {
    return NextResponse.json(
      { error: 'This slot is priced below the ₹1 minimum for online payment.' },
      { status: 400 }
    );
  }

  try {
    const order = await razorpay().orders.create({
      amount,
      currency: 'INR',
      // Ties the order back to what is being bought without leaking anything
      // personal into Razorpay's dashboard. Receipts are capped at 40 chars.
      receipt: `turf-${turfId}-${date}-${start_time}`.slice(0, 40),
      notes: {
        turf_id: String(turfId),
        date: String(date),
        start_time: String(start_time),
        user_id: String(auth.user.id),
      },
    });

    return NextResponse.json(
      {
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        // Sent from the server so the browser never has to guess which account
        // it is paying into, and so test mode can be labelled honestly in the UI.
        key_id: process.env.RAZORPAY_KEY_ID,
        test_mode: isTestMode(),
        turf_name: turfRows[0].name,
        price: rupees,
      },
      { status: 201 }
    );
  } catch (err) {
    // Razorpay's error carries the request payload; log only the shape of the
    // failure, never the body, and never anything key-bearing.
    const statusCode = (err as { statusCode?: number })?.statusCode;
    console.error('Razorpay order creation failed', { statusCode });

    if (statusCode === 401) {
      return NextResponse.json(
        { error: 'Payment gateway rejected our credentials.' },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: 'Could not start the payment. Please try again.' }, { status: 500 });
  }
}
