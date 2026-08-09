// One definition of what a slot costs, shared by the slots grid, the booking
// route and the owner's cash total — if these ever disagreed, a customer could
// be shown one price and charged another.

export interface PricingRule {
  id: number;
  turf_id: number;
  start_time: string;
  end_time: string;
  price: number;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** 'HH:MM' on a 24-hour clock. */
export function isValidTime(t: unknown): t is string {
  return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

/**
 * The price for a slot starting at `time`.
 *
 * A rule covers the slot when start_time <= time < end_time, so "18:00–22:00"
 * covers 18, 19, 20 and 21 but not 22 — which is how an owner reads
 * "6pm to 10pm". Rules that wrap past midnight are rejected at creation.
 *
 * Overlapping rules are allowed; the most recently added one wins, so an owner
 * correcting a price just adds a new rule over the top.
 */
export function priceForSlot(time: string, rules: PricingRule[], fallback: number): number {
  const minutes = timeToMinutes(time);
  let price = fallback;
  let bestId = -1;
  for (const rule of rules) {
    const from = timeToMinutes(rule.start_time);
    const to = timeToMinutes(rule.end_time);
    if (minutes >= from && minutes < to && rule.id > bestId) {
      price = rule.price;
      bestId = rule.id;
    }
  }
  return price;
}
