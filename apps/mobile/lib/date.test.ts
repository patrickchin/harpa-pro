/**
 * Unit tests for date formatting helpers.
 */
import { describe, it, expect } from 'vitest';
import { formatDate } from './date';

describe('formatDate', () => {
  it('formats ISO-8601 date string to human-readable format', () => {
    const result = formatDate('2024-03-15T10:30:00.000Z');
    expect(result).toBe('Mar 15, 2024');
  });

  it('formats Date object to human-readable format', () => {
    const date = new Date('2024-12-25T15:45:00.000Z');
    const result = formatDate(date);
    expect(result).toBe('Dec 25, 2024');
  });

  it('handles date at start of year', () => {
    const result = formatDate('2024-01-01T00:00:00.000Z');
    expect(result).toBe('Jan 1, 2024');
  });

  it('handles date at end of year', () => {
    const result = formatDate('2024-12-31T23:59:59.999Z');
    expect(result).toBe('Dec 31, 2024');
  });

  it('handles mid-year date', () => {
    const result = formatDate('2024-07-04T12:00:00.000Z');
    expect(result).toBe('Jul 4, 2024');
  });

  it('returns em-dash for null input', () => {
    const result = formatDate(null);
    expect(result).toBe('—');
  });

  it('returns em-dash for undefined input', () => {
    const result = formatDate(undefined);
    expect(result).toBe('—');
  });

  it('returns em-dash for invalid date string', () => {
    const result = formatDate('not-a-date');
    expect(result).toBe('—');
  });

  it('returns em-dash for empty string', () => {
    const result = formatDate('');
    expect(result).toBe('—');
  });
});
