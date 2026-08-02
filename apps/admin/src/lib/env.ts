/** Build-time browser configuration for the standalone admin application. */
function required(key: 'PUBLIC_API_BASE_URL'): string {
  const value = (
    import.meta as unknown as {
      env?: Record<string, string | undefined>;
    }
  ).env?.[key];

  if (!value) {
    throw new Error(
      `[admin/env] Missing ${key}. Set it in apps/admin/.env (dev) ` +
        'or in the admin deployment workflow.',
    );
  }

  return value;
}

export function getPublicEnv(): { apiBaseUrl: string } {
  return {
    apiBaseUrl: required('PUBLIC_API_BASE_URL'),
  };
}
