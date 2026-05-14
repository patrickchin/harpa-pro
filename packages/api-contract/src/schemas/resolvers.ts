import { z } from 'zod';
import { projectSlug, reportSlug, reportNumber } from './_shared.js';

/**
 * Response shapes for the short-URL resolver routes
 * (`GET /p/:projectSlug`, `GET /r/:reportSlug`).
 *
 * The API returns JSON (not a 308 redirect) so the mobile client can
 * `router.replace` to the canonical long URL without a visible flash.
 * See docs/v4/arch-ids-and-urls.md and design-p30-ids-slugs.md §4.
 */
export const projectResolverResponse = z.object({
  type: z.literal('project'),
  projectSlug,
});

export const reportResolverResponse = z.object({
  type: z.literal('report'),
  projectSlug,
  reportSlug,
  reportNumber,
});
