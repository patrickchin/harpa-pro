import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const faq = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/faq" }),
  schema: z.object({
    question: z.string(),
    order: z.number().default(0),
  }),
});

const features = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/features" }),
  schema: z.object({
    title: z.string(),
    icon: z.string(),
    order: z.number().default(0),
  }),
});

export const collections = { faq, features };
