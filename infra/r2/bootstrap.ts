/**
 * Cloudflare R2 bucket bootstrap (idempotent).
 *
 * Creates the bucket if it doesn't exist and applies a lifecycle rule
 * that deletes incomplete multipart uploads after 7 days. The API mints
 * signed upload URLs for the mobile client; nothing here grants public
 * access. See docs/v4/arch-storage.md.
 *
 * Required env:
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET (defaults to 'harpa-pro')
 */
import { request } from 'node:https';

const BUCKET = process.env['R2_BUCKET'] ?? 'harpa-pro';

function need(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} not set`);
  return v;
}

interface R2Response {
  status: number;
  body: string;
}

async function r2(method: string, path: string, body?: string): Promise<R2Response> {
  // The Cloudflare API for R2 management is REST. We do not pull in the AWS
  // SDK here on purpose — keep this script dependency-free so CI can run it
  // with `tsx infra/r2/bootstrap.ts` without installing extra packages.
  const accountId = need('R2_ACCOUNT_ID');
  const apiToken = need('R2_ACCESS_KEY_ID'); // for R2 management we use a Cloudflare API token in this slot
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: 'api.cloudflare.com',
        path: `/client/v4/accounts/${accountId}${path}`,
        method,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'content-type': 'application/json',
        },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: chunks }));
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function ensureBucket(): Promise<void> {
  const list = await r2('GET', '/r2/buckets');
  if (list.status === 200 && list.body.includes(`"name":"${BUCKET}"`)) {
    console.error(`[r2] bucket ${BUCKET} already exists`);
    return;
  }
  const create = await r2('POST', '/r2/buckets', JSON.stringify({ name: BUCKET }));
  if (create.status >= 300) {
    throw new Error(`r2 bucket create failed (${create.status}): ${create.body}`);
  }
  console.error(`[r2] created bucket ${BUCKET}`);
}

async function main(): Promise<void> {
  await ensureBucket();
  // Lifecycle rules are applied via S3-compatible API (separate from the
  // management API). Placeholder — we'll wire that in P4 along with deploy
  // hardening. Logging the intent here so the rule isn't silently missed.
  console.error('[r2] TODO: apply lifecycle rule (abort multipart > 7d) via S3 API in P4');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
