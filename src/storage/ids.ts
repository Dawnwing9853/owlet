/**
 * Random ids. Uses getRandomValues because randomUUID only exists on https and
 * localhost, and the app is also tested over plain http on a phone.
 *
 * Person ids must start with "p-": it sorts after "me", so when a split ties,
 * the leftover satang goes to me and not to a friend.
 */
export function newId(prefix: 'p' | 'b' | 'i'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}
