export interface PgErrorInfo {
  code: string;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Return the PostgreSQL driver error from either a direct throw or a
 * DrizzleQueryError cause chain.
 */
export function getPgError(error: unknown): PgErrorInfo | undefined {
  const seen = new Set<object>();
  let current = error;

  while (isRecord(current) && !seen.has(current)) {
    seen.add(current);
    if (typeof current.code === 'string') {
      return {
        code: current.code,
        ...(typeof current.message === 'string'
          ? { message: current.message }
          : {}),
      };
    }
    current = current.cause;
  }

  return undefined;
}
