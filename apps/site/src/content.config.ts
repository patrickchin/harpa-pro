import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const DOCS_TIERS = ["core", "everyday", "setup"] as const;

const reportsFaq = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/reports/faq" }),
  schema: z.object({
    question: z.string(),
    order: z.number().default(0),
  }),
});

const reportsFeatures = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/reports/features" }),
  schema: z.object({
    title: z.string(),
    icon: z.string(),
    order: z.number().default(0),
  }),
});

const reportsRoadmap = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/reports/roadmap" }),
  schema: z.object({
    title: z.string(),
    icon: z.string(),
    status: z.enum(["available", "planned"]),
    order: z.number().default(0),
  }),
});

const reportsDocs = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/reports/docs" }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    tier: z.enum(DOCS_TIERS),
    order: z.number().int().positive(),
    keywords: z.array(z.string().min(1)).min(1),
    lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    related: z.array(z.string()).default([]),
  }),
});

const procurementGuides = defineCollection({
  loader: glob({
    pattern: "**/*.mdx",
    base: "./src/content/procurement/guides",
  }),
  schema: ({ image }) => z.object({
    title: z.string().min(1),
    description: z.string().min(20),
    order: z.number().int().positive(),
    hero: z.object({
      image: image(),
      alt: z.string().startsWith("Generated illustration of ").min(36),
      caption: z.string().startsWith("Generated illustration · ").min(28),
    }).optional(),
  }),
});

export const collections = { reportsFaq, reportsFeatures, reportsRoadmap, reportsDocs, procurementGuides };
