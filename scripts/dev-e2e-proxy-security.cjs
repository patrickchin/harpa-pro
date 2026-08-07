/*
 * Shared trust boundary for the local Maestro API/R2 bridge.
 *
 * Requests arrive from an Android device through adb reverse. Treat every
 * request target as untrusted even though these helpers bind to loopback.
 */

const ALLOWED_R2_METHODS = new Set(['GET', 'HEAD', 'PUT']);
const REQUIRED_SIGV4_PARAMS = [
  'X-Amz-Credential',
  'X-Amz-Date',
  'X-Amz-Expires',
  'X-Amz-SignedHeaders',
  'X-Amz-Signature',
];

class ProxyTargetError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProxyTargetError';
    this.code = code;
  }
}

function parseApiRequestTarget(rawTarget) {
  if (
    typeof rawTarget !== 'string' ||
    !rawTarget.startsWith('/') ||
    rawTarget.startsWith('//') ||
    rawTarget.includes('\\')
  ) {
    throw new ProxyTargetError(
      'invalid_proxy_target',
      'API proxy request targets must be relative paths.',
    );
  }

  const localOrigin = 'http://dev-e2e-proxy.invalid';
  const parsed = new URL(rawTarget, localOrigin);
  if (parsed.origin !== localOrigin || parsed.hash) {
    throw new ProxyTargetError(
      'invalid_proxy_target',
      'API proxy request targets must stay on the configured upstream origin.',
    );
  }
  return `${parsed.pathname}${parsed.search}`;
}

function isR2Hostname(hostname) {
  return hostname.endsWith('.r2.cloudflarestorage.com') || hostname.endsWith('.r2.dev');
}

function parsePresignedR2Url(rawTarget) {
  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    throw new ProxyTargetError('invalid_r2_target', 'R2 proxy target must be a valid URL.');
  }

  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    target.port ||
    target.hash ||
    !isR2Hostname(target.hostname)
  ) {
    throw new ProxyTargetError(
      'invalid_r2_target',
      'R2 proxy target must use an approved Cloudflare R2 HTTPS host.',
    );
  }

  if (target.searchParams.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256') {
    throw new ProxyTargetError('invalid_r2_target', 'R2 proxy target must be SigV4 signed.');
  }
  for (const param of REQUIRED_SIGV4_PARAMS) {
    if (!target.searchParams.get(param)) {
      throw new ProxyTargetError('invalid_r2_target', `R2 proxy target is missing ${param}.`);
    }
  }

  const expires = target.searchParams.get('X-Amz-Expires');
  const signature = target.searchParams.get('X-Amz-Signature');
  const signedHeaders = target.searchParams.get('X-Amz-SignedHeaders');
  if (
    !expires ||
    !/^\d{1,3}$/.test(expires) ||
    Number(expires) < 1 ||
    Number(expires) > 300 ||
    !signature ||
    !/^[a-f0-9]{64}$/i.test(signature) ||
    !signedHeaders ||
    !signedHeaders.split(';').includes('host')
  ) {
    throw new ProxyTargetError('invalid_r2_target', 'R2 proxy signature is malformed.');
  }

  return target;
}

function isPresignedR2Url(rawTarget) {
  try {
    parsePresignedR2Url(rawTarget);
    return true;
  } catch {
    return false;
  }
}

function parseR2Target(rawTarget, method) {
  const normalizedMethod = String(method || '').toUpperCase();
  if (!ALLOWED_R2_METHODS.has(normalizedMethod)) {
    throw new ProxyTargetError('method_not_allowed', 'R2 proxy supports only GET, HEAD, and PUT.');
  }
  return parsePresignedR2Url(rawTarget);
}

module.exports = {
  ProxyTargetError,
  isPresignedR2Url,
  parseApiRequestTarget,
  parseR2Target,
};
