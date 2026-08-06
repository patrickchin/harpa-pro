import { describe, expect, it } from 'vitest';

import { reportGenerationStateTestId } from './generation-sync';

const cleanState = {
  generatedAt: '2026-08-06T10:00:02.000Z',
  notesChangedAt: '2026-08-06T10:00:01.000Z',
  needsRegeneration: false,
  uploadSyncPending: false,
  isGenerating: false,
  noteSyncPending: false,
  hasSyncError: false,
} as const;

describe('reportGenerationStateTestId', () => {
  it('stays pending while a local upload is settling or refetching', () => {
    expect(
      reportGenerationStateTestId({
        ...cleanState,
        uploadSyncPending: true,
      }),
    ).toBe('report-generation-pending');
  });

  it('stays pending while the canonical report row is dirty', () => {
    expect(
      reportGenerationStateTestId({
        ...cleanState,
        needsRegeneration: true,
      }),
    ).toBe('report-generation-pending');
  });

  it('stays pending while the generation mutation is still settling', () => {
    expect(
      reportGenerationStateTestId({
        ...cleanState,
        isGenerating: true,
      }),
    ).toBe('report-generation-pending');
  });

  it('stays pending while optimistic notes or their queries are settling', () => {
    expect(
      reportGenerationStateTestId({
        ...cleanState,
        noteSyncPending: true,
      }),
    ).toBe('report-generation-pending');
  });

  it('fails closed when generation-input synchronization has an error', () => {
    expect(
      reportGenerationStateTestId({
        ...cleanState,
        hasSyncError: true,
      }),
    ).toBe('report-generation-pending');
  });

  it('stays pending until generation covers the server note-change clock', () => {
    expect(
      reportGenerationStateTestId({
        ...cleanState,
        generatedAt: null,
      }),
    ).toBe('report-generation-pending');
    expect(
      reportGenerationStateTestId({
        ...cleanState,
        generatedAt: '2026-08-06T10:00:00.000Z',
      }),
    ).toBe('report-generation-pending');
  });

  it('is current when the clean generation covers the note-change clock', () => {
    expect(reportGenerationStateTestId(cleanState)).toBe('report-generation-current');
    expect(
      reportGenerationStateTestId({
        ...cleanState,
        generatedAt: cleanState.notesChangedAt,
      }),
    ).toBe('report-generation-current');
  });

  it('fails closed for missing or invalid server timestamps', () => {
    expect(
      reportGenerationStateTestId({
        ...cleanState,
        notesChangedAt: null,
      }),
    ).toBe('report-generation-pending');
    expect(
      reportGenerationStateTestId({
        ...cleanState,
        generatedAt: 'invalid',
      }),
    ).toBe('report-generation-pending');
  });
});
