import { z } from 'zod';

/**
 * ISO-8601 string with PG-textual fallback parsing.
 * Resolves docs/v4/pitfalls.md Pitfall 7.
 */
export const isoDateTime = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: 'invalid ISO-8601 date-time',
  })
  .transform((s) => new Date(s).toISOString());

export const uuid = z.string().uuid();
export const phone = z.string().regex(/^\+\d{8,15}$/, 'E.164 phone required');

/**
 * Public slugs — Crockford base32 (no I/L/O/U) prefixed identifiers.
 * Format: `<type>_<6 chars>` (`prj_8f3kq2`, `rpt_h7n2x9`).
 * Case-insensitive on input, normalised to lowercase.
 * See docs/v4/arch-ids-and-urls.md.
 */
const SLUG_CHARSET = '0-9a-hjkmnp-tv-z'; // Crockford base32, lowercase
export const projectSlug = z
  .string()
  .regex(new RegExp(`^prj_[${SLUG_CHARSET}]{6}$`, 'i'), 'invalid project slug')
  .transform((s) => s.toLowerCase());
export const reportSlug = z
  .string()
  .regex(new RegExp(`^rpt_[${SLUG_CHARSET}]{6}$`, 'i'), 'invalid report slug')
  .transform((s) => s.toLowerCase());
export const reportNumber = z.coerce.number().int().positive();

export const cursor = z.string().min(1).max(256);
export const limit = z.coerce.number().int().min(1).max(100).default(20);

export const paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: cursor.nullable(),
  });

export const errorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelope>;
