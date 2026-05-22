/**
 * Shared analytics event taxonomy.
 *
 * Why this package exists: in v3 event names drifted between the mobile
 * client and the server (typos, plural/singular, camelCase vs snake_case),
 * which made funnels in the analytics dashboard impossible to build. The
 * fix is to define names ONCE here, import the constants from every
 * surface (mobile, API, marketing), and let TypeScript catch drift at
 * compile time.
 *
 * Convention: snake_case event names, snake_case property keys.
 *
 * Properties are validated with Zod at the capture site in tests. We do
 * not Zod-validate in production hot paths (cost). The `EventMap` type
 * gives `capture()` callers compile-time type safety.
 */
import { z } from 'zod';

/** Surfaces that emit events. Tagged on every event as the `surface` property. */
export const SURFACES = ['mobile', 'api', 'marketing'] as const;
export type Surface = (typeof SURFACES)[number];

/** Common properties attached to every event by the capture helper. */
export const baseEventPropsSchema = z.object({
  surface: z.enum(SURFACES),
  env: z.enum(['development', 'preview', 'production', 'test']),
  app_version: z.string().optional(),
});
export type BaseEventProps = z.infer<typeof baseEventPropsSchema>;

// ---------- Marketing ----------

export const MARKETING_EVENTS = {
  WAITLIST_SUBMITTED: 'waitlist_submitted',
  CTA_CLICKED: 'cta_clicked',
  DEMO_STARTED: 'demo_started',
  DEMO_COMPLETED: 'demo_completed',
} as const;

export const waitlistSubmittedSchema = z.object({
  source: z.string(),
  has_referrer: z.boolean(),
});
export const ctaClickedSchema = z.object({
  cta_id: z.string(),
  location: z.string(),
});
export const demoStartedSchema = z.object({ demo_id: z.string() });
export const demoCompletedSchema = z.object({
  demo_id: z.string(),
  duration_ms: z.number().int().nonnegative(),
});

// ---------- Mobile ----------

export const MOBILE_EVENTS = {
  APP_OPENED: 'app_opened',
  OTP_REQUESTED: 'otp_requested',
  OTP_VERIFIED: 'otp_verified',
  REPORT_CREATE_STARTED: 'report_create_started',
  REPORT_CREATE_COMPLETED: 'report_create_completed',
  REPORT_SHARED: 'report_shared',
  AUDIO_RECORDING_STARTED: 'audio_recording_started',
  AUDIO_RECORDING_FAILED: 'audio_recording_failed',
  AI_PROVIDER_SELECTED: 'ai_provider_selected',
} as const;

export const appOpenedSchema = z.object({
  cold_start: z.boolean(),
  build_variant: z.enum(['development', 'preview', 'production']),
});
export const otpRequestedSchema = z.object({
  phone_country: z.string().length(2),
});
export const otpVerifiedSchema = z.object({
  attempts: z.number().int().positive(),
});
export const reportCreateStartedSchema = z.object({
  project_id: z.string(),
});
export const reportCreateCompletedSchema = z.object({
  project_id: z.string(),
  report_id: z.string(),
  duration_ms: z.number().int().nonnegative(),
});
export const reportSharedSchema = z.object({
  report_id: z.string(),
  channel: z.enum(['link', 'pdf', 'system_share']),
});
export const audioRecordingStartedSchema = z.object({
  project_id: z.string(),
});
export const audioRecordingFailedSchema = z.object({
  project_id: z.string(),
  reason: z.string(),
});
export const aiProviderSelectedSchema = z.object({
  provider: z.enum(['kimi', 'openai', 'anthropic', 'google', 'zai', 'deepseek']),
});

// ---------- API ----------

export const API_EVENTS = {
  REPORT_GENERATED: 'report_generated',
  REPORT_GENERATION_FAILED: 'report_generation_failed',
  SHARE_LINK_MINTED: 'share_link_minted',
  SHARE_LINK_REDEEMED: 'share_link_redeemed',
  R2_UPLOAD_FAILED: 'r2_upload_failed',
} as const;

export const reportGeneratedSchema = z.object({
  report_id: z.string(),
  provider: z.string(),
  duration_ms: z.number().int().nonnegative(),
  token_count: z.number().int().nonnegative().optional(),
});
export const reportGenerationFailedSchema = z.object({
  report_id: z.string().optional(),
  provider: z.string(),
  reason: z.string(),
});
export const shareLinkMintedSchema = z.object({
  report_id: z.string(),
  ttl_sec: z.number().int().positive(),
});
export const shareLinkRedeemedSchema = z.object({
  report_id: z.string(),
});
export const r2UploadFailedSchema = z.object({
  bucket: z.string(),
  reason: z.string(),
});

// ---------- Type-safe capture surface ----------

export type EventMap = {
  [MARKETING_EVENTS.WAITLIST_SUBMITTED]: z.infer<typeof waitlistSubmittedSchema>;
  [MARKETING_EVENTS.CTA_CLICKED]: z.infer<typeof ctaClickedSchema>;
  [MARKETING_EVENTS.DEMO_STARTED]: z.infer<typeof demoStartedSchema>;
  [MARKETING_EVENTS.DEMO_COMPLETED]: z.infer<typeof demoCompletedSchema>;
  [MOBILE_EVENTS.APP_OPENED]: z.infer<typeof appOpenedSchema>;
  [MOBILE_EVENTS.OTP_REQUESTED]: z.infer<typeof otpRequestedSchema>;
  [MOBILE_EVENTS.OTP_VERIFIED]: z.infer<typeof otpVerifiedSchema>;
  [MOBILE_EVENTS.REPORT_CREATE_STARTED]: z.infer<typeof reportCreateStartedSchema>;
  [MOBILE_EVENTS.REPORT_CREATE_COMPLETED]: z.infer<typeof reportCreateCompletedSchema>;
  [MOBILE_EVENTS.REPORT_SHARED]: z.infer<typeof reportSharedSchema>;
  [MOBILE_EVENTS.AUDIO_RECORDING_STARTED]: z.infer<typeof audioRecordingStartedSchema>;
  [MOBILE_EVENTS.AUDIO_RECORDING_FAILED]: z.infer<typeof audioRecordingFailedSchema>;
  [MOBILE_EVENTS.AI_PROVIDER_SELECTED]: z.infer<typeof aiProviderSelectedSchema>;
  [API_EVENTS.REPORT_GENERATED]: z.infer<typeof reportGeneratedSchema>;
  [API_EVENTS.REPORT_GENERATION_FAILED]: z.infer<typeof reportGenerationFailedSchema>;
  [API_EVENTS.SHARE_LINK_MINTED]: z.infer<typeof shareLinkMintedSchema>;
  [API_EVENTS.SHARE_LINK_REDEEMED]: z.infer<typeof shareLinkRedeemedSchema>;
  [API_EVENTS.R2_UPLOAD_FAILED]: z.infer<typeof r2UploadFailedSchema>;
};

export type EventName = keyof EventMap;

/** Maps each event name to its Zod schema for runtime validation in tests. */
export const eventSchemas: { [K in EventName]: z.ZodType<EventMap[K]> } = {
  [MARKETING_EVENTS.WAITLIST_SUBMITTED]: waitlistSubmittedSchema,
  [MARKETING_EVENTS.CTA_CLICKED]: ctaClickedSchema,
  [MARKETING_EVENTS.DEMO_STARTED]: demoStartedSchema,
  [MARKETING_EVENTS.DEMO_COMPLETED]: demoCompletedSchema,
  [MOBILE_EVENTS.APP_OPENED]: appOpenedSchema,
  [MOBILE_EVENTS.OTP_REQUESTED]: otpRequestedSchema,
  [MOBILE_EVENTS.OTP_VERIFIED]: otpVerifiedSchema,
  [MOBILE_EVENTS.REPORT_CREATE_STARTED]: reportCreateStartedSchema,
  [MOBILE_EVENTS.REPORT_CREATE_COMPLETED]: reportCreateCompletedSchema,
  [MOBILE_EVENTS.REPORT_SHARED]: reportSharedSchema,
  [MOBILE_EVENTS.AUDIO_RECORDING_STARTED]: audioRecordingStartedSchema,
  [MOBILE_EVENTS.AUDIO_RECORDING_FAILED]: audioRecordingFailedSchema,
  [MOBILE_EVENTS.AI_PROVIDER_SELECTED]: aiProviderSelectedSchema,
  [API_EVENTS.REPORT_GENERATED]: reportGeneratedSchema,
  [API_EVENTS.REPORT_GENERATION_FAILED]: reportGenerationFailedSchema,
  [API_EVENTS.SHARE_LINK_MINTED]: shareLinkMintedSchema,
  [API_EVENTS.SHARE_LINK_REDEEMED]: shareLinkRedeemedSchema,
  [API_EVENTS.R2_UPLOAD_FAILED]: r2UploadFailedSchema,
};

export * from './flags.js';
