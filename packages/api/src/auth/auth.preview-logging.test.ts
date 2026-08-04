import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

type SendVerificationOtp = (input: {
  email: string;
  otp: string;
  type: string;
}) => Promise<void>;

const captured = vi.hoisted(() => ({
  sendVerificationOTP: undefined as SendVerificationOtp | undefined,
}));

vi.mock('better-auth', () => ({
  betterAuth: vi.fn(() => ({
    handler: vi.fn(),
    api: {},
    $context: Promise.resolve({}),
  })),
}));

vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: vi.fn(() => ({})),
}));

vi.mock('better-auth/plugins', () => ({
  bearer: vi.fn(() => ({})),
  emailOTP: vi.fn((options: { sendVerificationOTP: SendVerificationOtp }) => {
    captured.sendVerificationOTP = options.sendVerificationOTP;
    return {};
  }),
}));

vi.mock('better-auth/api', () => ({
  APIError: class APIError extends Error {},
  createAuthMiddleware: vi.fn((middleware) => middleware),
}));

vi.mock('@better-auth/expo', () => ({
  expo: vi.fn(() => ({})),
}));

vi.mock('../db/client.js', () => ({
  rawDb: vi.fn(() => ({})),
}));

vi.mock('../db/auth-schema.js', () => ({}));

vi.mock('../env.js', () => ({
  env: {
    TEST_ACCOUNT_EMAILS: undefined,
    DEMO_ACCOUNT_EMAILS: undefined,
    BETTER_AUTH_SECRET: 'test-secret-at-least-sixteen-characters',
    BETTER_AUTH_URL: 'http://localhost:8787',
    DASHBOARD_CORS_ORIGINS: 'http://localhost:3003',
    ADMIN_CORS_ORIGINS: 'http://localhost:3002',
    NODE_ENV: 'development',
    EMAIL_OTP_LIVE: '0',
  },
}));

vi.mock('../lib/resend.js', () => ({
  createResendClient: vi.fn(() => ({ send: vi.fn() })),
}));

vi.mock('../lib/ids.js', () => ({
  newId: vi.fn(() => 'usr_test'),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

beforeAll(async () => {
  await import('./auth.js');
});

describe('preview email OTP diagnostics', () => {
  it('does not log the OTP or full recipient address', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const email = 'private.person+preview@example.com';
    const otp = '817263';

    expect(captured.sendVerificationOTP).toBeTypeOf('function');

    await captured.sendVerificationOTP?.({ email, otp, type: 'sign-in' });

    const output = [...logSpy.mock.calls, ...infoSpy.mock.calls].flat().join(' ');
    expect(output).not.toContain(otp);
    expect(output).not.toContain(email);
    expect(output).toContain('email_otp_preview');
    expect(output).toContain('example.com');
    expect(output).toContain('sign-in');
  }, 30_000);
});
