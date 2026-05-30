/**
 * Test-account password bypass — see docs/v4/arch-auth-and-rls.md
 * §Test-account password bypass.
 *
 * When `TEST_ACCOUNT_PHONES` and `TEST_ACCOUNT_PASSWORD` are both set,
 * `POST /auth/password/verify` accepts a shared password for any phone
 * in the allowlist and mints a session exactly like the OTP path.
 * Otherwise `isPasswordBypassEnabled()` returns false and the route
 * 404s.
 *
 * Password handling:
 *   - On first call we derive `expectedHash = scrypt(password, salt)`
 *     with a per-process random salt. The salt is never persisted; a
 *     restart re-derives both hashes — that's fine because the
 *     password itself is what we verify against, and the salt only
 *     exists to defeat pre-computation attacks against the in-memory
 *     hash.
 *   - Comparison uses `timingSafeEqual` to avoid leaking the
 *     prefix-match length via timing.
 *
 * No external dependency: uses node:crypto only.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const MIN_PASSWORD_LEN = 16;

interface BypassConfig {
  phones: ReadonlySet<string>;
  salt: Buffer;
  expectedHash: Buffer;
}

let _config: BypassConfig | null = null;
let _configLoaded = false;

function loadConfig(): BypassConfig | null {
  if (_configLoaded) return _config;
  _configLoaded = true;
  // Read directly from process.env (not the boot-parsed env) so test
  // setups that mutate env before each case are honoured after a
  // _resetPasswordBypassForTest() call.
  const phonesRaw = process.env.TEST_ACCOUNT_PHONES;
  const password = process.env.TEST_ACCOUNT_PASSWORD;
  if (!phonesRaw || !password) {
    _config = null;
    return null;
  }
  if (password.length < MIN_PASSWORD_LEN) {
    // Defence in depth: env.ts already enforces this via Zod, but the
    // bypass module is read at request time so we double-check rather
    // than ever using a weak password.
    _config = null;
    return null;
  }
  const phones = new Set(
    phonesRaw
      .split(',')
      .map((p) => normalisePhone(p))
      .filter((p) => p.length > 0),
  );
  if (phones.size === 0) {
    _config = null;
    return null;
  }
  const salt = randomBytes(16);
  const expectedHash = scryptSync(password, salt, SCRYPT_KEYLEN);
  _config = { phones, salt, expectedHash };
  return _config;
}

/** Test-only: clear the cached config so a new env can be picked up. */
export function _resetPasswordBypassForTest(): void {
  _config = null;
  _configLoaded = false;
}

export function isPasswordBypassEnabled(): boolean {
  return loadConfig() !== null;
}

function normalisePhone(p: string): string {
  return p.trim();
}

/**
 * Returns true iff (a) the bypass is enabled AND (b) the phone is in
 * the allowlist AND (c) the password matches. Returns false in every
 * other case — callers must not distinguish between "phone not in
 * allowlist" and "wrong password" in the response, to avoid letting
 * an attacker enumerate which phones are test accounts.
 */
export function verifyTestPassword(phone: string, password: string): boolean {
  const cfg = loadConfig();
  if (!cfg) return false;
  const normalised = normalisePhone(phone);
  // Always perform the scrypt work so timing doesn't reveal whether the
  // phone was allow-listed.
  const candidate = scryptSync(password, cfg.salt, SCRYPT_KEYLEN);
  const hashMatch =
    candidate.length === cfg.expectedHash.length &&
    timingSafeEqual(candidate, cfg.expectedHash);
  return hashMatch && cfg.phones.has(normalised);
}
