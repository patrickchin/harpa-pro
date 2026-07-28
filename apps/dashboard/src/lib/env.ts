import { z } from 'zod';

const optionalEnvString = (schema: z.ZodString) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const dashboardEnvSchema = z.object({
  VITE_API_BASE_URL: z
    .string()
    .url()
    .transform((value) => value.replace(/\/+$/, '')),
  VITE_SENTRY_DSN: optionalEnvString(z.string().url()),
  VITE_SENTRY_ENVIRONMENT: optionalEnvString(z.string().min(1)),
  VITE_SENTRY_RELEASE: optionalEnvString(z.string().min(1)),
});

export type DashboardEnv = z.infer<typeof dashboardEnvSchema>;

export function parseDashboardEnv(input: Record<string, unknown>): DashboardEnv {
  const result = dashboardEnvSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`[env] invalid dashboard environment: ${result.error.message}`);
  }
  return result.data;
}

export const env = parseDashboardEnv(import.meta.env);
