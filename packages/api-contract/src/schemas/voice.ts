import { z } from 'zod';
import { uuid } from './_shared.js';

export const transcribeRequest = z.object({
  fileId: uuid,
  fixtureName: z.string().optional(),
});
export const transcribeResponse = z.object({
  transcript: z.string(),
});

export const summarizeRequest = z.object({
  transcript: z.string().min(1),
  fixtureName: z.string().optional(),
});
export const summarizeResponse = z.object({
  summary: z.string(),
});
