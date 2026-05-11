/**
 * PII / secret redaction for fixture writes.
 * Defence-in-depth: pre-commit hook also greps for common patterns.
 */
const PHONE_RE = /\+\d{8,15}/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-]+/g;
const OPENAI_KEY_RE = /sk-[A-Za-z0-9_-]{20,}/g;

export function redact<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Strip auth-y headers entirely.
      if (/^(authorization|x-api-key|api-key|cookie|set-cookie)$/i.test(k)) {
        out[k] = '<redacted>';
      } else {
        out[k] = walk(v);
      }
    }
    return out;
  }
  return value;
}

function redactString(s: string): string {
  return s
    .replace(OPENAI_KEY_RE, 'sk-redacted')
    .replace(BEARER_RE, 'Bearer <redacted>')
    .replace(PHONE_RE, '+10000000000')
    .replace(EMAIL_RE, 'redacted@example.com')
    .replace(UUID_RE, '00000000-0000-0000-0000-000000000000');
}
