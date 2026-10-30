export function normalize(text: string): string { return text.replace(/\s+/g, ' ').trim(); }

// For local change detection, never used as an authentication or security hash.
export function fingerprint(input: string): string {
  let hash = 2166136261;
  for (const char of input) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `fnv1a:${(hash >>> 0).toString(16)}`;
}
