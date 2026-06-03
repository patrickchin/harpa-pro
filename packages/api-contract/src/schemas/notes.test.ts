import { describe, it, expect } from 'vitest';
import {
  notePlacement,
  updateNotePlacementRequest,
} from './notes.js';

describe('notePlacement', () => {
  it('accepts an issue placement', () => {
    const result = notePlacement.safeParse({ kind: 'issue', index: 2 });
    expect(result.success).toBe(true);
  });

  it('accepts a section placement', () => {
    const result = notePlacement.safeParse({ kind: 'section', index: 0 });
    expect(result.success).toBe(true);
  });

  it('rejects unknown kind', () => {
    const result = notePlacement.safeParse({ kind: 'meta', index: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative index', () => {
    const result = notePlacement.safeParse({ kind: 'issue', index: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer index', () => {
    const result = notePlacement.safeParse({ kind: 'issue', index: 1.5 });
    expect(result.success).toBe(false);
  });
});

describe('updateNotePlacementRequest', () => {
  it('accepts a placement', () => {
    const result = updateNotePlacementRequest.safeParse({
      placement: { kind: 'issue', index: 0 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts placement: null to clear', () => {
    const result = updateNotePlacementRequest.safeParse({ placement: null });
    expect(result.success).toBe(true);
  });

  it('rejects missing placement key', () => {
    const result = updateNotePlacementRequest.safeParse({});
    expect(result.success).toBe(false);
  });
});
