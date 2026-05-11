import { createHash } from 'node:crypto';

/** Stable canonical-JSON hash used for fixture lookup. */
export function hashRequest(input: unknown): string {
  return 'sha256:' + createHash('sha256').update(canonicalize(input)).digest('hex');
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return (
    '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + canonicalize(v)).join(',') + '}'
  );
}
