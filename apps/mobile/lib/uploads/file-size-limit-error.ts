import { ApiError } from '@/lib/api/errors';

export type UploadFileSizeLimitPlan = 'free' | 'pro' | 'enterprise';

export interface UploadFileSizeLimitDetails {
  sizeBytes: number;
  limitBytes: number;
  plan: UploadFileSizeLimitPlan;
}

export class UploadFileSizeLimitError extends Error {
  readonly code = 'file_size_limit_exceeded';
  readonly sizeBytes: number;
  readonly limitBytes: number;
  readonly plan: UploadFileSizeLimitPlan;

  constructor(details: UploadFileSizeLimitDetails) {
    super('This file is larger than your plan allows.');
    this.name = 'UploadFileSizeLimitError';
    this.sizeBytes = details.sizeBytes;
    this.limitBytes = details.limitBytes;
    this.plan = details.plan;
  }
}

function isPlan(value: unknown): value is UploadFileSizeLimitPlan {
  return value === 'free' || value === 'pro' || value === 'enterprise';
}

export function uploadFileSizeLimitFromError(
  error: unknown,
): UploadFileSizeLimitError | null {
  if (error instanceof UploadFileSizeLimitError) return error;
  if (!(error instanceof ApiError) || error.code !== 'file_size_limit_exceeded') {
    return null;
  }
  const details = error.details;
  if (!details || typeof details !== 'object') return null;
  const { sizeBytes, limitBytes, plan } = details as Record<string, unknown>;
  if (
    typeof sizeBytes !== 'number' ||
    !Number.isFinite(sizeBytes) ||
    sizeBytes < 0 ||
    typeof limitBytes !== 'number' ||
    !Number.isFinite(limitBytes) ||
    limitBytes < 0 ||
    !isPlan(plan)
  ) {
    return null;
  }
  return new UploadFileSizeLimitError({ sizeBytes, limitBytes, plan });
}

export function uploadFileSizeLimitFor(
  sizeBytes: number,
  limitBytes: number | null,
): UploadFileSizeLimitError | null {
  if (limitBytes === null || sizeBytes <= limitBytes) return null;
  return new UploadFileSizeLimitError({
    sizeBytes,
    limitBytes,
    plan: limitBytes <= 5 * 1024 * 1024 ? 'free' : 'pro',
  });
}
