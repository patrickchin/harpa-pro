import { describe, expect, it } from 'vitest';

import { TAB_ORDER } from './tabs';

describe('Generate Report tab contract', () => {
  it('excludes the removed Edit surface while preserving Debug', () => {
    expect(TAB_ORDER).toEqual(['notes', 'report', 'debug']);
  });
});
