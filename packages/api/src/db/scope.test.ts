import { describe, it, expect } from 'vitest';
import { withScopedConnection } from './scope.js';

describe('withScopedConnection', () => {
  it('rejects non-UUID sub', async () => {
    await expect(
      withScopedConnection({ sub: "abc'; DROP TABLE foo;--", sid: '00000000-0000-0000-0000-000000000001' }, async () => 1),
    ).rejects.toThrow(/claims\.sub is not a valid UUID/);
  });

  it('rejects non-UUID sid', async () => {
    await expect(
      withScopedConnection({ sub: '00000000-0000-0000-0000-000000000001', sid: 'nope' }, async () => 1),
    ).rejects.toThrow(/claims\.sid is not a valid UUID/);
  });
});
