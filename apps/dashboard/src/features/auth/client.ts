import { emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { env } from '@/lib/env';

export const authClient = createAuthClient({
  baseURL: `${env.VITE_API_BASE_URL}/api/auth`,
  plugins: [emailOTPClient()],
});

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  displayName: string | null;
  companyName: string | null;
  image?: string | null;
  createdAt: string | Date;
  updatedAt?: string | Date;
}

export async function requestSignInCode(email: string): Promise<void> {
  const result = await authClient.emailOtp.sendVerificationOtp({
    email,
    type: 'sign-in',
  });
  if (result.error) {
    throw new Error(result.error.message ?? 'Could not send the sign-in code.');
  }
}

export async function verifySignInCode(input: { email: string; otp: string }): Promise<void> {
  const result = await authClient.signIn.emailOtp(input);
  if (result.error) {
    throw new Error(result.error.message ?? 'The sign-in code was not accepted.');
  }
}

export async function signInWithPassword(input: {
  email: string;
  password: string;
}): Promise<void> {
  const result = await authClient.signIn.email(input);
  if (result.error) {
    throw new Error(result.error.message ?? 'Unable to sign in.');
  }
}
