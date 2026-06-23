/**
 * Vitest setup — runs once per test file before module loads.
 */
delete process.env.TEST_ACCOUNT_EMAILS;
delete process.env.TEST_ACCOUNT_PASSWORD;
delete process.env.DEMO_ACCOUNT_EMAILS;
delete process.env.DEMO_ACCOUNT_PASSWORD;
