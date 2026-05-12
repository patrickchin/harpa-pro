import { z } from 'zod';
import { uuid } from './_shared.js';

/**
 * fixtureName is forwarded to @harpa/ai-fixtures FixtureStore which uses
 * `path.join(dir, name + '.json')`. Restrict to a safe charset to prevent
 * path traversal (e.g. `../../etc/secrets`) at the contract boundary.
 */
const fixtureName = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._-]+$/, 'fixtureName must match /^[a-zA-Z0-9._-]+$/');

export const transcribeRequest = z.object({
  fileId: uuid,
  fixtureName: fixtureName.optional(),
});
export const transcribeResponse = z.object({
  transcript: z.string(),
});

export const summarizeRequest = z.object({
  transcript: z.string().min(1),
  fixtureName: fixtureName.optional(),
});
export const summarizeResponse = z.object({
  summary: z.string(),
});
