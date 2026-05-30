/**
 * Dev/test-only password login for live deployment E2E.
 *
 * This route lets Maestro authenticate allowlisted test accounts through a
 * local CLI auth broker when the dev deployment has live Twilio enabled. The
 * broker keeps the shared password out of Maestro env/input logs. It is
 * intentionally unavailable in production builds.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';

import type { ResponseBody } from '@/lib/api/client';
import { useVerifyPasswordMutation } from '@/lib/api/hooks';
import { useAuthSession } from '@/lib/auth';
import { env } from '@/lib/config/env';
import { colors } from '@/lib/design-tokens/colors';

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function normalizePhone(value: string): string {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return `+${trimmed}`;
  return trimmed.replace(/^ /, '+');
}

export default function E2ePasswordLoginPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    broker?: string | string[];
    phone?: string | string[];
  }>();
  const broker = firstParam(params.broker);
  const phone = normalizePhone(firstParam(params.phone));
  const session = useAuthSession();
  const verifyPassword = useVerifyPasswordMutation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const brokerStartedRef = useRef(false);

  useEffect(() => {
    if (env.EXPO_PUBLIC_APP_VARIANT === 'production') {
      setError('Password E2E login is unavailable in production builds.');
    }
  }, []);

  useEffect(() => {
    if (
      env.EXPO_PUBLIC_APP_VARIANT === 'production' ||
      !broker ||
      !phone ||
      brokerStartedRef.current
    ) {
      return;
    }

    brokerStartedRef.current = true;
    const controller = new AbortController();
    setError(null);
    setSubmitting(true);

    void (async () => {
      try {
        const result = await fetchBrokerSession(broker, phone, controller.signal);
        await session.signIn({
          token: result.token,
          user: result.user,
          phone,
        });
        router.replace('/' as Href);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to sign in test account.';
        setError(message);
        setSubmitting(false);
      }
    })();

    return () => controller.abort();
  }, [broker, phone, router, session]);

  async function handleSubmit() {
    if (isSubmitting || !phone || !password) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await verifyPassword.mutateAsync({
        body: { phone, password },
      });
      await session.signIn({
        token: result.token,
        user: result.user,
        phone,
      });
      router.replace('/' as Href);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to sign in test account.';
      setError(message);
      setSubmitting(false);
    }
  }

  const disabled =
    env.EXPO_PUBLIC_APP_VARIANT === 'production' ||
    !phone ||
    password.length === 0 ||
    isSubmitting ||
    verifyPassword.isPending;

  return (
    <View
      className="flex-1 items-center justify-center bg-background px-6"
      testID="screen-e2e-password-login"
    >
      {error ? (
        <Text
          className="text-center text-base font-semibold text-destructive"
          testID="e2e-password-login-error"
        >
          {error}
        </Text>
      ) : isSubmitting || verifyPassword.isPending ? (
        <>
          <ActivityIndicator color={colors.foreground} />
          <Text
            className="mt-4 text-center text-base text-muted-foreground"
            testID="e2e-password-login-status"
          >
            Signing in test account
          </Text>
        </>
      ) : broker ? (
        <Text
          className="text-center text-base font-semibold text-foreground"
          testID="e2e-password-login-status"
        >
          Preparing test account sign in
        </Text>
      ) : (
        <>
          <Text
            className="mb-4 text-center text-base font-semibold text-foreground"
            testID="e2e-password-login-status"
          >
            Test account password
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            className="w-full rounded border border-border px-4 py-3 text-foreground"
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            testID="input-e2e-password"
            value={password}
          />
          <Pressable
            accessibilityRole="button"
            className="mt-4 w-full items-center rounded bg-foreground px-4 py-3 disabled:opacity-50"
            disabled={disabled}
            onPress={handleSubmit}
            testID="btn-e2e-password-login"
          >
            <Text className="font-semibold text-background">Sign in</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

async function fetchBrokerSession(
  broker: string,
  phone: string,
  signal: AbortSignal,
): Promise<ResponseBody<'/auth/password/verify', 'post'>> {
  const url = new URL('/session', broker);
  url.searchParams.set('phone', phone);

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal,
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error('Auth broker returned invalid JSON.');
  }

  if (!res.ok) {
    const message =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      body.error &&
      typeof body.error === 'object' &&
      'message' in body.error &&
      typeof body.error.message === 'string'
        ? body.error.message
        : 'Auth broker rejected the test account.';
    throw new Error(message);
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !('token' in body) ||
    typeof body.token !== 'string' ||
    !('user' in body) ||
    !body.user
  ) {
    throw new Error('Auth broker returned an invalid session.');
  }

  return body as ResponseBody<'/auth/password/verify', 'post'>;
}
