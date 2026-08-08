/** Build-time browser configuration for the standalone admin application. */
type PublicEnvInput = Record<string, string | undefined>;

interface PublicEnv {
  apiBaseUrl: string;
  siteBaseUrl: string;
  dashboardUrl: string;
}

function required(input: PublicEnvInput, key: string): string {
  const value = input[key];

  if (!value) {
    throw new Error(
      `[admin/env] Missing ${key}. Set it in apps/admin/.env (dev) ` +
        'or in the admin deployment workflow.',
    );
  }

  return value;
}

function markerOrigin(input: PublicEnvInput, key: string): string {
  const value = required(input, key);
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`[admin/env] ${key} must be an exact HTTPS origin.`);
  }

  const isLoopbackHttp =
    url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (
    value !== url.origin ||
    url.username !== '' ||
    url.password !== '' ||
    (url.protocol !== 'https:' && !isLoopbackHttp)
  ) {
    throw new Error(
      `[admin/env] ${key} must be an exact HTTPS origin ` +
        'or an HTTP localhost/127.0.0.1 origin for local development.',
    );
  }

  return value;
}

export function parsePublicEnv(input: PublicEnvInput): PublicEnv {
  return {
    apiBaseUrl: required(input, 'PUBLIC_API_BASE_URL'),
    siteBaseUrl: markerOrigin(input, 'PUBLIC_SITE_BASE_URL'),
    dashboardUrl: markerOrigin(input, 'PUBLIC_DASHBOARD_URL'),
  };
}

export function getPublicEnv(): PublicEnv {
  const input = (
    import.meta as unknown as {
      env?: PublicEnvInput;
    }
  ).env;

  return parsePublicEnv(input ?? {});
}
