import { getCollection } from "astro:content";
import type { APIRoute } from "astro";

import { guideHref, sortGuides } from "../lib/docs";

export const prerender = true;

const STATIC_PATHS = ["/", "/roadmap", "/privacy", "/account-deletion", "/docs"];

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = site ?? new URL("https://harpapro.com");
  const guides = sortGuides(await getCollection("docs"));
  const paths = [...STATIC_PATHS, ...guides.map((guide) => guideHref(guide.id))];
  const urls = paths
    .map((path) => `  <url><loc>${new URL(path, baseUrl)}</loc></url>`)
    .join("\n");
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
