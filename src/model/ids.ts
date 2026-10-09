/** Short, URL-safe, random identifiers (20 base-36 characters, similar to Blockly's ids). */
export function newId(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += (b % 36).toString(36);
  return out;
}
