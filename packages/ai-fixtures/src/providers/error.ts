/**
 * Internal error thrown by provider adapters. Wrapped to
 * `AiProviderError` (→ 502) by `packages/api/src/services/ai.ts`.
 */
export class AdapterError extends Error {
  override readonly name = 'AdapterError';
  constructor(
    public vendor: string,
    public reason: string,
    public detail?: unknown,
  ) {
    super(`[ai-fixtures:${vendor}] ${reason}`);
  }
}
