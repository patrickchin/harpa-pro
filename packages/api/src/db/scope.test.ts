import { describe, it, expect } from 'vitest';
import { withScopedConnection } from './scope.js';
import { newId } from '../lib/ids.js';

describe('withScopedConnection', () => {
  it('rejects malformed sub', async () => {
    await expect(
      withScopedConnection({ sub: "abc'; DROP TABLE foo;--", sid: newId('ses') }, async () => 1),
    ).rejects.toThrow(/claims\.sub is not a valid usr_ id/);
  });

  it('rejects malformed sid', async () => {
    await expect(
      withScopedConnection({ sub: newId('usr'), sid: 'nope' }, async () => 1),
    ).rejects.toThrow(/claims\.sid is not a valid ses_ id/);
  });
});
