/**
 * Seed test accounts for journey tests and smoke testing.
 *
 * Usage:
 *   DATABASE_URL=... \
 *   TEST_ACCOUNT_EMAILS=test@example.com,admin@example.com \
 *   TEST_ACCOUNT_PASSWORD=... \
 *   pnpm --filter @harpa/api exec tsx scripts/seed-test-account.ts
 *
 * This script inserts users directly via the Drizzle adapter — bypassing
 * better-auth's sign-up hook (which blocks /sign-up/email for non-password
 * flows). It also creates an emailAndPassword account row so the test
 * password bypass in auth.ts can authenticate via POST /api/auth/sign-in/email.
 *
 * Idempotent: running it multiple times on the same DB is safe (upsert).
 */
import { rawDb, resetPool } from '../src/db/client.js';
import * as authSchema from '../src/db/auth-schema.js';
import { newId } from '../src/lib/ids.js';
import { env } from '../src/env.js';
import { eq } from 'drizzle-orm';
// Use better-auth's own password hasher so the stored hash matches what the
// emailAndPassword plugin's sign-in path expects (scrypt by default).
import { hashPassword } from 'better-auth/crypto';

const emails = (env.TEST_ACCOUNT_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const password = process.env.TEST_ACCOUNT_PASSWORD ?? '';

if (emails.length === 0) {
  console.error('TEST_ACCOUNT_EMAILS is not set or empty. Nothing to seed.');
  process.exit(1);
}
if (!password) {
  console.error('TEST_ACCOUNT_PASSWORD is not set. Nothing to seed.');
  process.exit(1);
}

resetPool();
const db = rawDb();
const passwordHash = await hashPassword(password);

for (const email of emails) {
  console.log(`Seeding test account: ${email}`);

  // Upsert the user row
  const existing = await db
    .select({ id: authSchema.user.id })
    .from(authSchema.user)
    .where(eq(authSchema.user.email, email))
    .limit(1);

  let userId: string;
  if (existing[0]) {
    userId = existing[0].id;
    console.log(`  User already exists: ${userId}`);
  } else {
    userId = newId('usr');
    await db.insert(authSchema.user).values({
      id: userId,
      name: email.split('@')[0] ?? email,
      email,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`  Created user: ${userId}`);
  }

  // Upsert the credential row so emailAndPassword sign-in works
  const existingAccount = await db
    .select({ id: authSchema.account.id })
    .from(authSchema.account)
    .where(eq(authSchema.account.userId, userId))
    .limit(1);

  if (existingAccount[0]) {
    await db
      .update(authSchema.account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(authSchema.account.id, existingAccount[0].id));
    console.log(`  Updated credential: ${existingAccount[0].id}`);
  } else {
    const accountId = newId('idn');
    await db.insert(authSchema.account).values({
      id: accountId,
      accountId: email,
      providerId: 'credential',
      userId,
      password: passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`  Created credential: ${accountId}`);
  }
}

console.log('Done.');
process.exit(0);
