import { z } from 'zod';

export const aiVendor = z.enum(['kimi', 'openai', 'anthropic', 'google', 'zai', 'deepseek']);
export type AiVendor = z.infer<typeof aiVendor>;

export const aiSettings = z.object({
  vendor: aiVendor,
  model: z.string(),
});

export const updateAiSettingsRequest = aiSettings.partial();
