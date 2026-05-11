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
