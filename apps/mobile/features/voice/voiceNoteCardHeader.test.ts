import { describe, expect, it } from 'vitest';

import { deriveVoiceCardHeader, formatDuration } from './voiceNoteCardHeader';
import type { NoteEntry } from '@/lib/note-entry';

const base: NoteEntry = {
  id: 'n1',
  text: '',
  addedAt: 0,
  source: 'voice',
};

describe('deriveVoiceCardHeader', () => {
  it('renders "Voice note" with play enabled when saved + fileId present', () => {
    const h = deriveVoiceCardHeader({
      ...base,
      fileId: 'f1',
      transcript: 'hello',
      summary: 's',
    });
    expect(h.phase).toBe('ready');
    expect(h.label).toBe('Voice note');
    expect(h.canPlay).toBe(true);
    expect(h.showRetry).toBe(false);
    expect(h.errorMessage).toBeNull();
  });

  it('disables playback on a saved row without fileId (defensive)', () => {
    const h = deriveVoiceCardHeader({ ...base, fileId: null });
    expect(h.phase).toBe('ready');
    expect(h.canPlay).toBe(false);
  });

  it('shows uploading label when pipeline is uploading', () => {
    const h = deriveVoiceCardHeader({ ...base, voiceStatus: 'uploading' });
    expect(h.phase).toBe('uploading');
    expect(h.label).toBe('Uploading…');
    expect(h.canPlay).toBe(false);
  });

  it('shows transcribing label when pipeline is transcribing', () => {
    const h = deriveVoiceCardHeader({ ...base, voiceStatus: 'transcribing' });
    expect(h.phase).toBe('transcribing');
    expect(h.label).toBe('Transcribing…');
    expect(h.canPlay).toBe(false);
  });

  it('shows failure label + retry + error when pipeline failed', () => {
    const h = deriveVoiceCardHeader({
      ...base,
      voiceStatus: 'failed',
      voiceError: 'R2 PUT 503',
    });
    expect(h.phase).toBe('failed');
    expect(h.label).toBe('Voice note failed');
    expect(h.showRetry).toBe(true);
    expect(h.errorMessage).toBe('R2 PUT 503');
    expect(h.canPlay).toBe(false);
  });

  it('falls back to a default error message when none provided', () => {
    const h = deriveVoiceCardHeader({ ...base, voiceStatus: 'failed' });
    expect(h.errorMessage).toBe('Save failed. Tap retry.');
  });
});

describe('formatDuration', () => {
  it('formats seconds as m:ss with zero padding', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(7)).toBe('0:07');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3661)).toBe('61:01');
  });

  it('returns 0:00 for null / undefined / negative / NaN', () => {
    expect(formatDuration(null)).toBe('0:00');
    expect(formatDuration(undefined)).toBe('0:00');
    expect(formatDuration(-5)).toBe('0:00');
    expect(formatDuration(Number.NaN)).toBe('0:00');
  });
});
