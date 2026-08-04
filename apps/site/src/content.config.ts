import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

import { DOCS_SCREENSHOT_IDS } from "./lib/docs";

const DOCS_TIERS = ["core", "everyday", "setup"] as const;

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
    tier: z.enum(DOCS_TIERS),
    order: z.number().int().positive(),
    keywords: z.array(z.string().min(1)).min(1),
    lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    related: z.array(z.string()).default([]),
    heroScreenshot: z.enum(DOCS_SCREENSHOT_IDS),
    heroScreenshotAlt: z.string().min(12),
  }),
});

export const collections = { faq, features, roadmap, docs };
