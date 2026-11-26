import { APP_STORE_URL } from "../reports/links";
import { REPORTS_SOCIAL_IMAGE } from "../social-images";

/**
 * Audience-scoped site chrome. Each page passes its section explicitly to
 * `Layout`, `Header`, and `Footer`; see
 * docs/v4/design-public-site-audience-chrome.md.
 */
export const SITE_SECTIONS = ["procurement", "reports", "shared"] as const;
export type SiteSection = (typeof SITE_SECTIONS)[number];
export type AudienceSection = Exclude<SiteSection, "shared">;

export const AUDIENCE_SWITCH_LOCATIONS = [
  "header",
  "mobile_menu",
  "footer",
  "not_found",
] as const;
export type AudienceSwitchLocation = (typeof AUDIENCE_SWITCH_LOCATIONS)[number];

export interface NavLink {
  label: string;
  href: string;
  description?: string;
  /** Lucide icon name. */
  icon?: string;
  external?: boolean;
}

export interface SectionMenu {
  id: "procurement" | "site-reporting";
  summary: string;
  icon: string;
  intro: { title: string; body: string };
  links: NavLink[];
  /** The mobile menu omits links that the mobile actions already offer. */
  mobileLinks: NavLink[];
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export interface SectionConfig {
  id: SiteSection;
  label: string;
  /** Wordmark target. */
  home: string;
  breadcrumbRoot?: BreadcrumbItem;
  menu?: SectionMenu;
  cta?: NavLink & { icon: string };
  crossLink?: NavLink & { to: AudienceSection };
  footer: { tagline: string; columns: { label: string; links: NavLink[] }[] };
  meta: {
    title: string;
    description: string;
    /** Absent for procurement: Layout builds the interior social image. */
    image?: string;
    imageAlt: string;
    themeColor: string;
  };
}

const PROCUREMENT_LINKS: NavLink[] = [
  { label: "Procurement Overview", href: "/", description: "Our procurement service", icon: "package-search" },
  { label: "Products and factories", href: "/#factory-partners", description: "Joinery, furniture, bathrooms, and source records", icon: "armchair" },
  { label: "Our process", href: "/#considerations", description: "Design coordination, quality checks, and delivery", icon: "list-checks" },
  { label: "How to Buy from China", href: "/procurement/how-to-buy-from-china", description: "A guide for architects and designers", icon: "file-text" },
  { label: "Procurement guides", href: "/procurement/guides" },
];

const REPORTS_LINKS: NavLink[] = [
  { label: "Harpa Pro App", href: "/reports", description: "See the reporting workflow", icon: "smartphone" },
  { label: "Guides", href: "/reports/docs", description: "Learn each app task", icon: "book-open" },
  { label: "Roadmap", href: "/reports/roadmap", description: "Current and planned work", icon: "map" },
];

const GET_THE_APP = {
  label: "Get the App",
  href: APP_STORE_URL,
  description: "Open the App Store",
  icon: "download",
  external: true,
} as const satisfies NavLink;

const CONTACT = { label: "Contact Us", href: "/#contact", icon: "message-circle" } as const satisfies NavLink;
const PRIVACY: NavLink = { label: "Privacy", href: "/privacy" };

const PROCUREMENT_MENU: SectionMenu = {
  id: "procurement",
  summary: "Procurement",
  icon: "package-search",
  intro: {
    title: "Procurement in China",
    body: "We coordinate factory information, product specifications, quality checks, and shipping records.",
  },
  links: PROCUREMENT_LINKS,
  mobileLinks: PROCUREMENT_LINKS,
};

const REPORTS_MENU: SectionMenu = {
  id: "site-reporting",
  summary: "Site Reporting",
  icon: "clipboard-list",
  intro: {
    title: "Site Reporting",
    body: "Turn voice notes, photos, and text updates into daily report drafts that you can review and share.",
  },
  links: [...REPORTS_LINKS, GET_THE_APP],
  mobileLinks: REPORTS_LINKS,
};

// Reference page reached from the homepage evidence summary; footer only, so
// the header menu stays focused on the main procurement entry points.
const FACTORY_DOCUMENTS: NavLink = { label: "Factory documents", href: "/procurement/factory-documents" };
const PROCUREMENT_COLUMN = { label: "Procurement", links: [...PROCUREMENT_LINKS, FACTORY_DOCUMENTS] };
const REPORTS_COLUMN = {
  label: "Site Reporting",
  links: [...REPORTS_LINKS, GET_THE_APP, { label: "Account Deletion", href: "/reports/account-deletion" }],
};

export const ALSO_FROM_LABEL = "Also from Harpa Pro";
const DEFAULT_THEME_COLOR = "#e55d22";

export const SECTIONS: Record<SiteSection, SectionConfig> = {
  procurement: {
    id: "procurement",
    label: "Procurement",
    home: "/",
    breadcrumbRoot: { name: "Procurement", path: "/" },
    menu: PROCUREMENT_MENU,
    cta: CONTACT,
    crossLink: { label: "Site reporting app", href: "/reports", to: "reports" },
    footer: {
      tagline: "Technical procurement and factory records in China.",
      columns: [PROCUREMENT_COLUMN, { label: "Company", links: [CONTACT, PRIVACY] }],
    },
    meta: {
      title: "Interior Procurement in China | Harpa Pro",
      description:
        "Harpa Pro coordinates interior procurement in China: design specifications, factory coordination, quality checks, shipping, and procurement documentation.",
      imageAlt:
        "Generated living-room material concept with walnut joinery, pale stone, and linen upholstery",
      themeColor: DEFAULT_THEME_COLOR,
    },
  },
  reports: {
    id: "reports",
    label: "Site Reporting",
    home: "/reports",
    breadcrumbRoot: { name: "Site Reporting", path: "/reports" },
    menu: REPORTS_MENU,
    cta: GET_THE_APP,
    crossLink: { label: "Interior procurement", href: "/", to: "procurement" },
    footer: {
      tagline: "Daily site reports from voice notes, photos, and text.",
      columns: [REPORTS_COLUMN, { label: "Company", links: [PRIVACY] }],
    },
    meta: {
      title: "Site Reports by Voice | Harpa Pro",
      description:
        "Turn voice notes, photos, and text into daily site report drafts that you can review and share.",
      image: REPORTS_SOCIAL_IMAGE.src,
      imageAlt: REPORTS_SOCIAL_IMAGE.alt,
      themeColor: DEFAULT_THEME_COLOR,
    },
  },
  shared: {
    id: "shared",
    label: "Harpa Pro",
    home: "/",
    footer: {
      tagline: "Interior procurement in China and the Harpa Pro site-reporting app.",
      columns: [PROCUREMENT_COLUMN, REPORTS_COLUMN, { label: "Company", links: [CONTACT, PRIVACY] }],
    },
    meta: {
      title: "Harpa Pro",
      description:
        "Harpa Pro offers interior procurement in China and a site-reporting app for construction teams.",
      image: REPORTS_SOCIAL_IMAGE.src,
      imageAlt: REPORTS_SOCIAL_IMAGE.alt,
      themeColor: DEFAULT_THEME_COLOR,
    },
  },
};

/** Plain primary links for shared pages, which present both offers equally. */
export const SHARED_OFFERS: (NavLink & { icon: string; to: AudienceSection })[] = [
  { label: "Interior procurement", href: "/", icon: "package-search", to: "procurement" },
  { label: "Site reporting app", href: "/reports", icon: "clipboard-list", to: "reports" },
];

export function isSiteSection(value: unknown): value is SiteSection {
  return typeof value === "string" && (SITE_SECTIONS as readonly string[]).includes(value);
}

export function isAudienceSwitchLocation(value: unknown): value is AudienceSwitchLocation {
  return typeof value === "string" && (AUDIENCE_SWITCH_LOCATIONS as readonly string[]).includes(value);
}

/** Runtime-only lookup (analytics, 404 hint, tests). Pages pass their section explicitly. */
export function sectionForPath(pathname: string): SiteSection {
  const path = pathname.split(/[?#]/)[0] || "/";
  if (path === "/reports" || path.startsWith("/reports/")) return "reports";
  if (path === "/" || path === "/procurement" || path.startsWith("/procurement/")) return "procurement";
  return "shared";
}

/** Prepends the section root unless the trail already starts there. */
export function breadcrumbTrail(section: SiteSection, trail: BreadcrumbItem[]): BreadcrumbItem[] {
  const root = SECTIONS[section].breadcrumbRoot;
  if (!root || trail[0]?.path === root.path) return trail;
  return [root, ...trail];
}

/** JSON-LD for the same items the visible `Breadcrumbs` component renders. */
export function breadcrumbJsonLd(site: URL | string, pageUrl: string, items: BreadcrumbItem[]) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${pageUrl}#breadcrumbs`,
    itemListElement: items.map(({ name, path }, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: new URL(path, site).href,
    })),
  };
}
