import { sha256 } from '@noble/hashes/sha2.js';

export function snapshotHash(text: string): string {
  return 'sha256:' + Array.from(sha256(new TextEncoder().encode(text)), n => n.toString(16).padStart(2, '0')).join('');
}
// Schema parsers may reorder keys; arrays retain their intentional order.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => JSON.stringify(k) + ':' + canonicalJson(v)).join(',') + '}';
  return JSON.stringify(value ?? null);
}
export function evidenceDigest(value: unknown): string { return snapshotHash(canonicalJson(value)); }
