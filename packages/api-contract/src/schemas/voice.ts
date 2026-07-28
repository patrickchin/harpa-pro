import { z } from 'zod';
import { fileId } from './ids.js';

/**
 * In server-selected replay mode, fixtureName is forwarded to the
 * @harpa/ai-fixtures FixtureStore, which uses `path.join(dir, name +
 * '.json')`. Restrict it to a safe charset to prevent path traversal
 * (e.g. `../../etc/secrets`) at the contract boundary. It never selects
 * live versus replay mode.
 */
const fixtureName = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._-]+$/, 'fixtureName must match /^[a-zA-Z0-9._-]+$/');

export const transcribeRequest = z.object({
  fileId: fileId,
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
