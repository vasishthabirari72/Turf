// Player and creator names are self-declared and hand-typed — nobody copies them
// from anywhere — so "Bob", "bob" and " Bob " all mean the same person. Compare
// names through normalizeName; store them as typed (trimmed) so the UI still
// shows the capitalisation the player chose.
export function normalizeName(n: string): string {
  return n.trim().toLowerCase();
}

export function sameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

// True when `list` already contains `name` under any capitalisation/spacing.
export function includesName(list: string[], name: string): boolean {
  return list.some((entry) => sameName(entry, name));
}
