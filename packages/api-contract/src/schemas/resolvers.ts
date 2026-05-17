import { z } from 'zod';
import { reportNumber } from './_shared.js';
import { projectId, reportId } from './ids.js';

/**
 * Response shapes for the short-URL resolver routes
 * (`GET /p/:project`, `GET /r/:report`).
 *
 * The API returns JSON (not a 308 redirect) so the mobile client can
 * `router.replace` to the canonical long URL without a visible flash.
 * See docs/v4/arch-ids-and-urls.md.
 */
export const projectResolverResponse = z.object({
  type: z.literal('project'),
  projectId,
});

export const reportResolverResponse = z.object({
  type: z.literal('report'),
  projectId,
  reportId,
  reportNumber,
});
