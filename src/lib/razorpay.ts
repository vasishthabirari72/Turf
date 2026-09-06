import 'server-only';

import crypto from 'node:crypto';
import Razorpay from 'razorpay';

/**
 * Razorpay wiring, in one place.
 *
 * The secret never leaves this module: it signs orders and verifies payment
 * signatures, and anyone holding it can forge a "payment verified" response.
 * That is why it is `RAZORPAY_KEY_SECRET` and not `NEXT_PUBLIC_...` — only the
 * key id is safe in the browser, and it is duplicated under a NEXT_PUBLIC_ name
 * for Checkout to read.
 *
 * Both variables are optional on purpose. Without them the checkout keeps the
 * old mock payment sheet, so a fresh clone with no Razorpay account still runs
 * the demo end to end.
 */

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

/** True when real payments are configured. Checked before every gateway call. */
export function isRazorpayConfigured(): boolean {
  return Boolean(keyId && keySecret);
}

/**
 * A test key is `rzp_test_...`; a live one is `rzp_live_...`. Surfaced so the
 * UI can say "test mode" out loud rather than letting a demo be mistaken for
 * a real charge.
 */
export function isTestMode(): boolean {
  return !keyId || keyId.startsWith('rzp_test_');
}

let client: Razorpay | null = null;

/** Throws rather than returning a half-configured client. */
export function razorpay(): Razorpay {
  if (!keyId || !keySecret) {
    throw new Error('Razorpay is not configured: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  client ??= new Razorpay({ key_id: keyId, key_secret: keySecret });
  return client;
}

/** Razorpay counts in paise, and rejects anything under 100 (₹1). */
export const MIN_AMOUNT_PAISE = 100;

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * The signature Razorpay sends back is HMAC-SHA256 of "order_id|payment_id"
 * keyed with the secret. Recomputing it is the only thing that proves a payment
 * actually happened — the browser's success callback is just a claim, and a
 * hostile client can call our verify endpoint with anything it likes.
 *
 * Compared with timingSafeEqual so the comparison leaks nothing about how much
 * of a forged signature was correct.
 */
export function isValidPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  if (!keySecret) return false;
  if (typeof signature !== 'string' || signature.length === 0) return false;

  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const given = Buffer.from(signature, 'utf8');
  const want = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on a length mismatch, which is itself a mismatch.
  if (given.length !== want.length) return false;
  return crypto.timingSafeEqual(given, want);
}
