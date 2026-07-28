import { z } from 'zod';

/**
 * Slug-only ID system (P3.1). One column per entity, Stripe-style prefix
 * + Crockford base32 body. The `id` IS the slug. See
 * docs/v4/design-p31-slug-only-ids.md.
 *
 * Branding is compile-time only — runtime safety comes from `idSchema`
 * regex parsing at the route boundary and per-column Postgres DOMAIN
 * CHECK constraints.
 */

/** Crockford base32 lowercase character class (no I/L/O/U). */
const CB32 = '0-9a-hjkmnp-tv-z';

interface IdSpec {
  /** Length the generator emits today. */
  currentLen: number;
  /** Smallest length ever minted for this prefix. Never decrease. */
  minLen: number;
  /** Hard upper bound; raise only via a `*_grow_<prefix>_id.sql` migration. */
  maxLen: number;
  /** Branded TS type name (informational; the brand is the literal here). */
  brand: string;
}

export const ID_SPEC = {
  prj: { currentLen: 8,  minLen: 8, maxLen: 16, brand: 'ProjectId' },
  rpt: { currentLen: 8,  minLen: 8, maxLen: 16, brand: 'ReportId' },
  usr: { currentLen: 12, minLen: 8, maxLen: 16, brand: 'UserId' },
  ses: { currentLen: 12, minLen: 8, maxLen: 16, brand: 'SessionId' },
  vrf: { currentLen: 10, minLen: 8, maxLen: 16, brand: 'VerificationId' },
  idn: { currentLen: 12, minLen: 8, maxLen: 16, brand: 'AccountIdentityId' },
  not: { currentLen: 10, minLen: 8, maxLen: 16, brand: 'NoteId' },
  fil: { currentLen: 10, minLen: 8, maxLen: 16, brand: 'FileId' },
  wls: { currentLen: 10, minLen: 8, maxLen: 16, brand: 'WaitlistSignupId' },
  lue: { currentLen: 12, minLen: 8, maxLen: 16, brand: 'LlmUsageEventId' },
  nfl: { currentLen: 10, minLen: 8, maxLen: 16, brand: 'NoteFileId' },
  rcm: { currentLen: 10, minLen: 8, maxLen: 16, brand: 'ReportCommentId' },
  aud: { currentLen: 12, minLen: 8, maxLen: 16, brand: 'ActivityEventId' },
} as const satisfies Record<string, IdSpec>;

export type Prefix = keyof typeof ID_SPEC;

/** Branded string type per prefix. Compile-time disjoint. */
export type Id<P extends Prefix> = string & {
  readonly __brand: (typeof ID_SPEC)[P]['brand'];
};

export type ProjectId        = Id<'prj'>;
export type ReportId         = Id<'rpt'>;
export type UserId           = Id<'usr'>;
export type SessionId        = Id<'ses'>;
export type VerificationId   = Id<'vrf'>;
export type AccountIdentityId = Id<'idn'>;
export type NoteId           = Id<'not'>;
export type FileId           = Id<'fil'>;
export type WaitlistSignupId = Id<'wls'>;
export type LlmUsageEventId  = Id<'lue'>;
export type NoteFileId       = Id<'nfl'>;
export type ReportCommentId  = Id<'rcm'>;
export type ActivityEventId  = Id<'aud'>;

/**
 * Build a Zod schema for a given prefix. Accepts the full historical
 * length range `[minLen, maxLen]`; the generator emits at `currentLen`.
 * Case-insensitive on input, normalised to lowercase.
 *
 * The schema infers plain `string` (not the branded `Id<P>`) so that
 * response payloads and DB rows — which carry unbranded strings — type
 * check naturally against `z.infer<typeof someSchema>`. The brand is
 * applied explicitly at the boundaries that care (service signatures,
 * `assertId(...)`, `newId(...)`), where mixing `ProjectId` with
 * `ReportId` *is* a compile error.
 */
export function idSchema<P extends Prefix>(prefix: P) {
  const { minLen, maxLen } = ID_SPEC[prefix];
  const re = new RegExp(`^${prefix}_[${CB32}]{${minLen},${maxLen}}$`, 'i');
  return z
    .string()
    .regex(re, `invalid ${prefix}_ id`)
    .transform((s) => s.toLowerCase());
}

export const projectId        = idSchema('prj');
export const reportId         = idSchema('rpt');
export const userId           = idSchema('usr');
export const sessionId        = idSchema('ses');
export const verificationId   = idSchema('vrf');
export const accountIdentityId = idSchema('idn');
export const noteId           = idSchema('not');
export const fileId           = idSchema('fil');
export const waitlistSignupId = idSchema('wls');
export const llmUsageEventId  = idSchema('lue');
export const noteFileId       = idSchema('nfl');
export const reportCommentId  = idSchema('rcm');
export const activityEventId  = idSchema('aud');
