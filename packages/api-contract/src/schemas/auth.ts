import { z } from 'zod';
import { isoDateTime, phone, uuid } from './_shared.js';

export const otpStartRequest = z.object({ phone });
export const otpStartResponse = z.object({ verificationId: z.string() });

export const otpVerifyRequest = z.object({
  phone,
  code: z.string().regex(/^\d{4,8}$/),
});

export const userPublic = z.object({
  id: uuid,
  phone,
  displayName: z.string().nullable(),
  companyName: z.string().nullable(),
  createdAt: isoDateTime,
});
export type UserPublic = z.infer<typeof userPublic>;

export const otpVerifyResponse = z.object({
  token: z.string(),
  user: userPublic,
});

export const updateMeRequest = z.object({
  displayName: z.string().min(1).max(120).optional(),
  companyName: z.string().min(1).max(120).optional(),
});

export const usageMonth = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  reports: z.number().int().nonnegative(),
  voiceNotes: z.number().int().nonnegative(),
});
export const usageResponse = z.object({
  months: z.array(usageMonth),
  totals: z.object({
    reports: z.number().int().nonnegative(),
    voiceNotes: z.number().int().nonnegative(),
  }),
});
