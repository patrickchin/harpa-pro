import type { files as fileSchemas } from '@harpa/api-contract';
import type { z } from 'zod';

import type { ScopedDb } from '../db/scope.js';
import {
  fileSizeLimitBytesForPlan,
  getEffectiveLimits,
  type Plan,
} from './usage-limits.js';

type FileSizeLimitExceededDetails = z.infer<
  typeof fileSchemas.fileSizeLimitExceededDetails
>;

export class FileSizeLimitExceededError extends Error {
  readonly code = 'file_size_limit_exceeded';
  readonly details: FileSizeLimitExceededDetails;

  constructor(details: FileSizeLimitExceededDetails) {
    super('This file is larger than your plan allows.');
    this.name = 'FileSizeLimitExceededError';
    this.details = details;
  }
}

export function assertFileSizeWithinLimit(
  sizeBytes: number,
  plan: Plan,
  now: Date = new Date(),
): void {
  const limitBytes = fileSizeLimitBytesForPlan(plan, now);
  if (sizeBytes > limitBytes) {
    throw new FileSizeLimitExceededError({ sizeBytes, limitBytes, plan });
  }
}

export async function enforceFileSizeLimit(
  db: ScopedDb,
  userId: string,
  sizeBytes: number,
  now: Date = new Date(),
): Promise<void> {
  const effective = await getEffectiveLimits(db, userId, now);
  if (sizeBytes > effective.fileSizeLimitBytes) {
    throw new FileSizeLimitExceededError({
      sizeBytes,
      limitBytes: effective.fileSizeLimitBytes,
      plan: effective.plan,
    });
  }
}
