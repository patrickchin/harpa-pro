/**
 * Vitest setup — runs once per test file before module loads. Sets a
 * fixed DEV_OTP_TOKEN so app.ts's dev-route mount sees it at module
 * import time. Tests that need to assert "route absent when token
 * unset" use vi.resetModules() + delete process.env.DEV_OTP_TOKEN
 * before re-importing.
 */
delete process.env.TEST_ACCOUNT_EMAILS;
delete process.env.TEST_ACCOUNT_PASSWORD;
process.env.DEV_OTP_TOKEN ??= 'test-dev-otp-token-AAAAAAAAAAAAAAAAAA'; // 36 chars
