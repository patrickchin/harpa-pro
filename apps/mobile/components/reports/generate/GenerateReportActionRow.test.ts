import { describe, expect, it } from 'vitest';

import { isGenerateReportActionRowBusy } from './GenerateReportActionRow';

describe('isGenerateReportActionRowBusy', () => {
  it('blocks finalize while an attachment-placement write is pending or failed', () => {
    expect(
      isGenerateReportActionRowBusy({
        isUpdating: false,
        isFinalizing: false,
        isAutoSaving: false,
        isReportWriteBlocked: true,
      }),
    ).toBe(true);
  });

  it('allows actions after every report write settles cleanly', () => {
    expect(
      isGenerateReportActionRowBusy({
        isUpdating: false,
        isFinalizing: false,
        isAutoSaving: false,
        isReportWriteBlocked: false,
      }),
    ).toBe(false);
  });
});
