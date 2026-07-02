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

const roadmap = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/roadmap" }),
  schema: z.object({
    title: z.string(),
    icon: z.string(),
    status: z.enum(["available", "planned"]),
    order: z.number().default(0),
  }),
});

const docs = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/docs" }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    category: z.enum(["start", "reporting", "collaboration", "account"]),
    order: z.number().int().positive(),
    keywords: z.array(z.string().min(1)).min(1),
    lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    related: z.array(z.string()).default([]),
    screenshot: z.string().startsWith("/").optional(),
  }),
});

export const collections = { faq, features, roadmap, docs };
