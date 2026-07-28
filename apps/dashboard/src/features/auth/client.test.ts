import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => {
  const sendVerificationOtp = vi.fn();
  const verifyEmailOtp = vi.fn();
  const client = {
    emailOtp: { sendVerificationOtp },
    signIn: { emailOtp: verifyEmailOtp },
  };

  return {
    client,
    createAuthClient: vi.fn(() => client),
    emailOTPClient: vi.fn(() => ({ id: 'email-otp-plugin' })),
    sendVerificationOtp,
    verifyEmailOtp,
  };
});

vi.mock('better-auth/react', () => ({
  createAuthClient: authMocks.createAuthClient,
}));

vi.mock('better-auth/client/plugins', () => ({
  emailOTPClient: authMocks.emailOTPClient,
}));

import { authClient, requestSignInCode, verifySignInCode } from './client';

describe('dashboard auth client', () => {
  beforeEach(() => {
    authMocks.sendVerificationOtp.mockReset();
    authMocks.verifyEmailOtp.mockReset();
  });

  it('targets the API auth handler and installs the email OTP plugin', () => {
    expect(authClient).toBe(authMocks.client);
    expect(authMocks.emailOTPClient).toHaveBeenCalledOnce();
    expect(authMocks.createAuthClient).toHaveBeenCalledWith({
      baseURL: 'http://localhost:8787/api/auth',
      plugins: [{ id: 'email-otp-plugin' }],
    });
  });

  it('requests an email sign-in code', async () => {
    authMocks.sendVerificationOtp.mockResolvedValue({ error: null });

    await requestSignInCode('manager@example.com');

    expect(authMocks.sendVerificationOtp).toHaveBeenCalledWith({
      email: 'manager@example.com',
      type: 'sign-in',
    });
  });

  it('surfaces email delivery errors with a stable fallback', async () => {
    authMocks.sendVerificationOtp
      .mockResolvedValueOnce({ error: { message: 'Delivery failed.' } })
      .mockResolvedValueOnce({ error: {} });

    await expect(requestSignInCode('manager@example.com')).rejects.toThrow('Delivery failed.');
    await expect(requestSignInCode('manager@example.com')).rejects.toThrow(
      'Could not send the sign-in code.',
    );
  });

  it('verifies an email sign-in code', async () => {
    authMocks.verifyEmailOtp.mockResolvedValue({ error: null });

    await verifySignInCode({
      email: 'manager@example.com',
      otp: '123456',
    });

    expect(authMocks.verifyEmailOtp).toHaveBeenCalledWith({
      email: 'manager@example.com',
      otp: '123456',
    });
  });

  it('surfaces rejected sign-in codes with a stable fallback', async () => {
    authMocks.verifyEmailOtp
      .mockResolvedValueOnce({ error: { message: 'Expired code.' } })
      .mockResolvedValueOnce({ error: {} });

    await expect(
      verifySignInCode({
        email: 'manager@example.com',
        otp: '123456',
      }),
    ).rejects.toThrow('Expired code.');
    await expect(
      verifySignInCode({
        email: 'manager@example.com',
        otp: '123456',
      }),
    ).rejects.toThrow('The sign-in code was not accepted.');
  });
});
