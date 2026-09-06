/**
 * Browser-side helpers for Razorpay Standard Checkout.
 *
 * Nothing here decides anything. Checkout hands back a payment id and a
 * signature, and both are only claims until the server recomputes the
 * signature — see src/app/api/payments/verify/route.ts.
 */

export const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (payload: { error?: { description?: string } }) => void) => void;
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

/**
 * Resolves once checkout.js has defined window.Razorpay.
 *
 * next/script loads the tag, but "the tag is in the DOM" and "the global
 * exists" are different moments, and a user can tap Pay in between. Rejecting
 * on a blocked script matters more than usual here: ad blockers block this
 * domain, and the failure is otherwise a button that silently does nothing.
 */
export function loadRazorpay(timeoutMs = 15000): Promise<RazorpayConstructor> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay Checkout can only load in the browser.'));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);

  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (window.Razorpay) return resolve(window.Razorpay);
      if (Date.now() - started > timeoutMs) {
        return reject(
          new Error("Couldn't reach the payment provider. Check your connection or any ad blocker.")
        );
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}
