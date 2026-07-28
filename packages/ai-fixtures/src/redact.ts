/**
 * PII / secret redaction for fixture writes.
 * Defence-in-depth: pre-commit hook also greps for common patterns.
 */
const PHONE_RE = /\+\d{8,15}/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-]+/g;
const OPENAI_KEY_RE = /sk-[A-Za-z0-9_-]{20,}/g;
const STREET_ADDRESS_SOURCE = String.raw`\b\d{1,6}[A-Za-z]?\s+(?:[\p{L}\p{N}'-]+\s+){0,5}(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Drive|Dr|Court|Ct|Boulevard|Blvd|Way|Place|Pl|Close|Terrace)\b`;
const UK_POSTCODE_SOURCE = String.raw`\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b`;
const ORGANIZATION_SUFFIX_SOURCE = String.raw`(?:Company|company|Construction|construction|Developments?|developments?|Group|group|Holdings?|holdings?|Ltd|LTD|Limited|LIMITED|LLC|Inc|INC|Corp(?:oration)?|CORP(?:ORATION)?)`;
const ORGANIZATION_NAME_SOURCE = String.raw`(?:The\s+)?[\p{Lu}][\p{L}\p{N}&.'-]*(?:\s+[\p{Lu}][\p{L}\p{N}&.'-]*){0,4}`;

const AUTH_KEY_RE = /^(authorization|x-api-key|api-key|cookie|set-cookie)$/i;
const ORGANIZATION_KEY_RE =
  /^(client|customer|company|business|organisation|organization|project|site)(Name)?$/i;
const ADDRESS_KEY_RE =
  /^(client|customer|company|project|site)?(Street)?Address$|^(postCode|postalCode|zipCode|siteLocation)$/i;

const ORGANIZATION_PLACEHOLDER = '<redacted-organization>';
const ADDRESS_PLACEHOLDER = '<redacted-address>';

const ORGANIZATION_SUFFIX_WORDS = new Set([
  'company',
  'construction',
  'development',
  'developments',
  'group',
  'holding',
  'holdings',
  'ltd',
  'limited',
  'llc',
  'inc',
  'corp',
  'corporation',
]);

const GENERIC_ORGANIZATION_TERMS = new Set([
  'business',
  'client',
  'company',
  'construction',
  'customer',
  'group',
  'organization',
  'organisation',
  'project',
  'site',
  'the',
]);

interface SensitiveTerms {
  organizations: Set<string>;
  addresses: Set<string>;
}

export interface FixtureRedactionInput<Request, Response> {
  request: Request;
  response: Response;
  /**
   * Source data used to discover identifiers that may be repeated in
   * provider output. It is never included in the returned fixture data.
   */
  privateContext?: unknown;
}

export function redact<T>(value: T): T {
  const terms = collectSensitiveTerms(value);
  return walk(value, terms) as T;
}

export function redactFixture<Request, Response>(
  input: FixtureRedactionInput<Request, Response>,
): { request: Request; response: Response } {
  const terms = collectSensitiveTerms([input.request, input.response, input.privateContext]);
  return {
    request: walk(input.request, terms) as Request,
    response: walk(input.response, terms) as Response,
  };
}

function collectSensitiveTerms(value: unknown): SensitiveTerms {
  const terms: SensitiveTerms = {
    organizations: new Set<string>(),
    addresses: new Set<string>(),
  };
  collect(value, terms);
  return terms;
}

function collect(value: unknown, terms: SensitiveTerms, key?: string): void {
  if (typeof value === 'string') {
    if (key && ORGANIZATION_KEY_RE.test(key)) {
      addOrganization(value, terms.organizations);
    }
    if (key && ADDRESS_KEY_RE.test(key)) {
      addTerm(value, terms.addresses);
    }
    collectFromText(value, terms);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, terms, key);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      collect(childValue, terms, childKey);
    }
  }
}

function collectFromText(value: string, terms: SensitiveTerms): void {
  const contextualOrganization = new RegExp(
    String.raw`\b(?:client|customer)\s+(?:(?:is|from|for|called|named)\s+)?(?:the\s+)?([\p{L}\p{N}&.'-]+(?:\s+[\p{L}\p{N}&.'-]+){0,4}?)(?=\s+${ORGANIZATION_SUFFIX_SOURCE}\b|[,.;]|\s+(?:and|at|with|for)\b|$)`,
    'giu',
  );
  for (const match of value.matchAll(contextualOrganization)) {
    addOrganization(match[1] ?? '', terms.organizations);
  }

  const suffixedOrganization = new RegExp(
    String.raw`\b(${ORGANIZATION_NAME_SOURCE})\s+(${ORGANIZATION_SUFFIX_SOURCE})\b`,
    'gu',
  );
  for (const match of value.matchAll(suffixedOrganization)) {
    addOrganization(`${match[1] ?? ''} ${match[2] ?? ''}`, terms.organizations);
  }

  const streetAddress = new RegExp(STREET_ADDRESS_SOURCE, 'giu');
  for (const match of value.matchAll(streetAddress)) {
    addTerm(match[0], terms.addresses);
  }

  const postcode = new RegExp(UK_POSTCODE_SOURCE, 'gi');
  for (const match of value.matchAll(postcode)) {
    addTerm(match[0], terms.addresses);
  }
}

function addOrganization(value: string, organizations: Set<string>): void {
  const normalized = value
    .trim()
    .replace(/^the\s+/i, '')
    .replace(/^[\s"'([{]+|[\s"')\]},.;:]+$/g, '');
  if (normalized.length < 3 || normalized.length > 160) return;

  const words = normalized.split(/\s+/);
  addTerm(words.join(' '), organizations, GENERIC_ORGANIZATION_TERMS);
  addTerm(words[0] ?? '', organizations, GENERIC_ORGANIZATION_TERMS);
  while (words.length > 1 && ORGANIZATION_SUFFIX_WORDS.has(words.at(-1)!.toLowerCase())) {
    words.pop();
    addTerm(words.join(' '), organizations, GENERIC_ORGANIZATION_TERMS);
  }
}

function addTerm(
  value: string,
  terms: Set<string>,
  blocked: Set<string> = new Set<string>(),
): void {
  const normalized = value.trim();
  if (
    normalized.length >= 3 &&
    normalized.length <= 200 &&
    !blocked.has(normalized.toLowerCase())
  ) {
    terms.add(normalized);
  }
}

function walk(value: unknown, terms: SensitiveTerms): unknown {
  if (typeof value === 'string') return redactString(value, terms);
  if (Array.isArray(value)) return value.map((item) => walk(item, terms));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Strip auth-y headers entirely.
      if (AUTH_KEY_RE.test(k)) {
        out[k] = '<redacted>';
      } else if (typeof v === 'string' && ORGANIZATION_KEY_RE.test(k)) {
        out[k] = ORGANIZATION_PLACEHOLDER;
      } else if (typeof v === 'string' && ADDRESS_KEY_RE.test(k)) {
        out[k] = ADDRESS_PLACEHOLDER;
      } else {
        out[k] = walk(v, terms);
      }
    }
    return out;
  }
  return value;
}

function replaceTerms(value: string, terms: Set<string>, placeholder: string): string {
  return [...terms]
    .sort((a, b) => b.length - a.length)
    .reduce(
      (result, term) =>
        result.replace(
          new RegExp(String.raw`(?<![\p{L}\p{N}])${escapeRegExp(term)}(?![\p{L}\p{N}])`, 'giu'),
          placeholder,
        ),
      value,
    );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactString(s: string, terms: SensitiveTerms): string {
  const secretsRedacted = s
    .replace(OPENAI_KEY_RE, 'sk-redacted')
    .replace(BEARER_RE, 'Bearer <redacted>')
    .replace(PHONE_RE, '+10000000000')
    .replace(EMAIL_RE, 'redacted@example.com')
    .replace(UUID_RE, '00000000-0000-0000-0000-000000000000');
  const organizationsRedacted = replaceTerms(
    secretsRedacted,
    terms.organizations,
    ORGANIZATION_PLACEHOLDER,
  );
  const addressesRedacted = replaceTerms(
    organizationsRedacted,
    terms.addresses,
    ADDRESS_PLACEHOLDER,
  );
  return addressesRedacted
    .replace(new RegExp(STREET_ADDRESS_SOURCE, 'giu'), ADDRESS_PLACEHOLDER)
    .replace(new RegExp(UK_POSTCODE_SOURCE, 'gi'), ADDRESS_PLACEHOLDER);
}
