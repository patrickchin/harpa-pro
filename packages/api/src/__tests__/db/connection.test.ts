import { describe, expect, it } from 'vitest';
import { parseConnection } from '../../db/connection.js';

describe('parseConnection', () => {
  it('strips sslmode=require and asks for verify-full TLS', () => {
    const out = parseConnection('postgres://u:p@host:5432/db?sslmode=require');
    expect(out.connectionString).not.toContain('sslmode');
    expect(out.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('maps verify-ca and verify-full to rejectUnauthorized: true', () => {
    expect(parseConnection('postgres://u:p@h/d?sslmode=verify-ca').ssl).toEqual({
      rejectUnauthorized: true,
    });
    expect(parseConnection('postgres://u:p@h/d?sslmode=verify-full').ssl).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('maps sslmode=disable to ssl:false (plain TCP)', () => {
    const out = parseConnection('postgres://u:p@h/d?sslmode=disable');
    expect(out.ssl).toBe(false);
    expect(out.connectionString).not.toContain('sslmode');
  });

  it('leaves ssl undefined when no sslmode is given (local docker)', () => {
    const out = parseConnection('postgres://postgres:pg@pg:5432/harpa');
    expect(out.ssl).toBeUndefined();
    expect(out.connectionString).toBe('postgres://postgres:pg@pg:5432/harpa');
  });

  it('also strips sslrootcert / sslcert / sslkey', () => {
    const out = parseConnection(
      'postgres://u:p@h/d?sslmode=require&sslrootcert=/x&sslcert=/y&sslkey=/z',
    );
    expect(out.connectionString).not.toMatch(/ssl(mode|rootcert|cert|key)=/);
  });

  it('preserves unrelated query params', () => {
    const out = parseConnection(
      'postgres://u:p@h/d?sslmode=require&application_name=harpa-api',
    );
    expect(out.connectionString).toContain('application_name=harpa-api');
  });

  it('falls back gracefully on an unparseable URL', () => {
    const raw = 'not a real url';
    const out = parseConnection(raw);
    expect(out.connectionString).toBe(raw);
    expect(out.ssl).toBeUndefined();
  });
});
