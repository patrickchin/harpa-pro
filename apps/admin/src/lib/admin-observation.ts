import { getPublicEnv } from './env';

interface ObservationSchema<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false };
}

export type AdminObservationResult<T> =
  | { status: 'ready'; observation: T }
  | { status: 'unauthorized' }
  | { status: 'http-error'; responseStatus: number }
  | { status: 'network-error' }
  | { status: 'invalid-response' };

export async function loadAdminObservation<T>(
  path: string,
  schema: ObservationSchema<T>,
): Promise<AdminObservationResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${getPublicEnv().apiBaseUrl}${path}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    return { status: 'network-error' };
  }

  if (response.status === 401) return { status: 'unauthorized' };
  if (!response.ok) return { status: 'http-error', responseStatus: response.status };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: 'invalid-response' };
  }

  const parsed = schema.safeParse(body);
  return parsed.success
    ? { status: 'ready', observation: parsed.data }
    : { status: 'invalid-response' };
}
