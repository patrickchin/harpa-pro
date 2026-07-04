/**
 * Vitest setup — runs once per test file before module loads.
 */
delete process.env.TEST_ACCOUNT_EMAILS;
delete process.env.TEST_ACCOUNT_PASSWORD;
delete process.env.DEMO_ACCOUNT_EMAILS;
delete process.env.DEMO_ACCOUNT_PASSWORD;
delete process.env.REVENUECAT_LIVE;
delete process.env.REVENUECAT_SECRET_API_KEY;
delete process.env.REVENUECAT_WEBHOOK_AUTH;
delete process.env.REVENUECAT_BASE_URL;
delete process.env.FREEMIUM_ENFORCEMENT_ENABLED;
delete process.env.FREEMIUM_ENFORCEMENT_AT;
