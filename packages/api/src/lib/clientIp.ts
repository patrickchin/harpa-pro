/**
 * Client IP extraction — single source of truth. Used by the rate-limit
 * middleware (`keyBy: 'ip'`) and any route that needs to key off the
 * caller IP.
 *
 * Header precedence (matches docs/v4/arch-rate-limiting.md §3.1):
 *   1. `Fly-Client-IP`    — authenticated Fly.io proxy metadata.
 *   2. `CF-Connecting-IP` — Cloudflare proxy fallback outside Fly.
 *   3. `X-Forwarded-For`  — generic reverse proxy / local dev.
 *
 * Falls back to the literal string `'unknown'` so the caller never has
 * to handle null. NEVER trust the socket address in serverless: the
 * connection always terminates at the platform proxy.
 */
import type { Context } from 'hono';
import type { AppEnv } from '../app.js';
import { isIP } from 'node:net';
import { z } from 'zod';

function validIp(value: string | undefined): string | null {
  const candidate = value?.trim();
  return candidate && isIP(candidate) !== 0 ? candidate : null;
}

export function clientIp(c: Context<AppEnv>): string {
  const fly = validIp(c.req.header('fly-client-ip'));
  const cf = validIp(c.req.header('cf-connecting-ip'));
  const xff = (c.req.header('x-forwarded-for') ?? '').split(',')[0]?.trim();
  return fly ?? cf ?? validIp(xff) ?? 'unknown';
}

/**
 * Pull `phone` from the validated JSON body — used by
 * `withRateLimit({ keyBy: 'phone' })` for routes whose abuse vector is
 * per-phone (OTP send/verify, test-account password bypass).
 *
 * Relies on `@hono/zod-openapi`'s validator caching `c.req.valid('json')`
 * on the request context. If a future Hono upgrade breaks that
 * contract, the helper falls back to an explicit re-parse via
 * `c.req.json()` — see docs/v4/arch-rate-limiting.md §6.
 */
const phoneShape = z.object({ phone: z.string().min(1) });

export async function phoneOf(c: Context<AppEnv>): Promise<string | null> {
  try {
    const cached = (c.req as unknown as { valid?: (k: 'json') => unknown }).valid?.('json');
    const parsed = phoneShape.safeParse(cached);
    if (parsed.success) return parsed.data.phone;
  } catch {
    // Fall through to JSON re-parse.
  }
  try {
    const body = await c.req.json();
    const parsed = phoneShape.safeParse(body);
    if (parsed.success) return parsed.data.phone;
  } catch {
    // No JSON body — nothing to key off.
  }
  return null;
}
