import { describe, expect, it } from 'vitest';
import { canonicalAdminEmail, hashAdminPassword, verifyAdminPassword } from './admin-auth.js';

describe('admin auth credentials', () => {
  it('accepts only the exact harpapro.com mail domain and canonicalizes case', () => {
    expect(canonicalAdminEmail(' Patrick.Chin@HarpaPro.com ')).toBe('patrick.chin@harpapro.com');
    expect(canonicalAdminEmail('patrick@admin.harpapro.com')).toBeNull();
    expect(canonicalAdminEmail('patrick@harpapro.com.evil.example')).toBeNull();
    expect(canonicalAdminEmail('patrick@example.com')).toBeNull();
  });

  it('creates salted scrypt hashes and verifies the correct long password', async () => {
    const password = 'correct horse battery staple admin password';
    const first = await hashAdminPassword(password);
    const second = await hashAdminPassword(password);

    expect(first).toMatch(/^scrypt-v1\$16384\$8\$5\$/);
    expect(second).not.toBe(first);
    await expect(verifyAdminPassword(password, first)).resolves.toBe(true);
    await expect(verifyAdminPassword(`${password}!`, first)).resolves.toBe(false);
  }, 15_000);

  it('rejects short passwords and malformed stored hashes', async () => {
    await expect(hashAdminPassword('too-short')).rejects.toThrow(/20/);
    await expect(
      verifyAdminPassword('correct horse battery staple admin password', 'not-a-hash'),
    ).resolves.toBe(false);
  });
});
