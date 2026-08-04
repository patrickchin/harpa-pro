/**
 * Unit tests for the PDF export pipeline.
 *
 * Ported from
 * `../haru3-reports/apps/mobile/lib/export-report-pdf.test.ts` on
 * branch `dev` and adapted for the v4 `@harpa/report-core` schema
 * (no `meta.reportType` field).
 *
 * Strategy: stub the native modules (`expo-print`, `expo-sharing`,
 * `expo-linking`, `expo-file-system`, `react-native`) at module
 * boundary so the file-system/move/share/open code paths run in
 * pure node without dragging in native bindings.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedSiteReport } from '@harpa/report-core';

const {
  fileContents,
  moveBarrier,
  openUrlMock,
  platformMock,
  printToFileAsyncMock,
  shareAsyncMock,
  shareAvailableMock,
  joinUriParts,
} = vi.hoisted(() => ({
  fileContents: new Map<string, string | Uint8Array>(),
  moveBarrier: { wait: Promise.resolve() as Promise<void> },
  openUrlMock: vi.fn(),
  platformMock: { OS: 'ios' as 'ios' | 'android' | 'web' },
  printToFileAsyncMock: vi.fn(),
  shareAsyncMock: vi.fn(),
  shareAvailableMock: vi.fn(),
  joinUriParts(parts: Array<string | { uri: string }>) {
    return parts
      .map((part) => (typeof part === 'string' ? part : part.uri))
      .join('/')
      .replace(/(?<!:)\/{2,}/g, '/')
      .replace('file:////', 'file:///')
      .replace('file:/', 'file:///');
  },
}));

vi.mock('expo-file-system', () => {
  class MockFile {
    uri: string;

    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = joinUriParts(parts);
    }

    get name() {
      return decodeURIComponent(this.uri.split('/').pop() ?? '');
    }

    get contentUri() {
      if (!this.uri.startsWith('file://')) return this.uri;
      return `content://${this.uri.replace(/^file:\/+/, '')}`;
    }

    get exists() {
      return fileContents.has(this.uri);
    }

    async move(destination: { uri: string }) {
      await moveBarrier.wait;
      const stored = fileContents.get(this.uri);
      if (stored !== undefined) {
        fileContents.set(destination.uri, stored);
        fileContents.delete(this.uri);
      }
      this.uri = destination.uri;
    }

    create() {
      if (!fileContents.has(this.uri)) {
        fileContents.set(this.uri, new Uint8Array());
      }
    }

    write(content: string | Uint8Array) {
      fileContents.set(this.uri, content);
    }

    delete() {
      fileContents.delete(this.uri);
    }
  }

  class MockDirectory {
    uri: string;

    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = joinUriParts(parts);
    }

    create() {}
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: {
      document: { uri: 'file:///mock/documents' },
      cache: { uri: 'file:///mock/cache' },
    },
  };
});

vi.mock('expo-print', () => ({
  printToFileAsync: printToFileAsyncMock,
}));

vi.mock('expo-linking', () => ({
  openURL: openUrlMock,
}));

vi.mock('expo-sharing', () => ({
  isAvailableAsync: shareAvailableMock,
  shareAsync: shareAsyncMock,
}));

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: platformMock,
}));

vi.mock('./report-to-html', () => ({
  reportToHtml: vi.fn(() => '<html><body>report</body></html>'),
}));

import {
  exportReportPdf,
  getSavedReportDetails,
  openSavedReportPdf,
  saveReportPdf,
  shareSavedReportPdf,
} from './export-report-pdf';

function makeReport(title: string): GeneratedSiteReport {
  return {
    report: {
      meta: {
        title,
        summary: 'Summary',
        visitDate: '2026-04-20',
      },
      weather: null,
      workers: null,
      materials: [],
      issues: [],
      nextSteps: [],
      sections: [],
    },
  };
}

function normalizeFileUri(uri: string): string {
  return uri.replace('file:////', 'file:///');
}

describe('saveReportPdf', () => {
  beforeEach(() => {
    fileContents.clear();
    moveBarrier.wait = Promise.resolve();
    platformMock.OS = 'ios';
    printToFileAsyncMock.mockReset();
  });

  it('saves into app cache/Harpa Pro/reports/<site> with a date-first filename', async () => {
    printToFileAsyncMock.mockImplementation(async () => {
      const tempUri = 'file:///tmp/generated-report.pdf';
      fileContents.set(tempUri, new Uint8Array([1, 2, 3, 4]));
      return { uri: tempUri };
    });

    const result = await saveReportPdf(makeReport('Daily Progress'), {
      siteName: 'Riverside Tower',
    });

    expect(result.pdfFilename).toBe('2026-04-20-daily-progress.pdf');
    expect(result.locationDescription).toBe(
      'PDF saved for sharing: 2026-04-20-daily-progress.pdf',
    );
    expect(normalizeFileUri(result.pdfUri)).toBe(
      'file:///mock/cache/Harpa Pro/reports/riverside-tower/2026-04-20-daily-progress.pdf',
    );
    expect(normalizeFileUri(result.htmlUri ?? '')).toBe(
      'file:///mock/cache/Harpa Pro/reports/riverside-tower/2026-04-20-daily-progress.html',
    );
  });

  it('falls back to a generic site directory when the site name is missing', async () => {
    printToFileAsyncMock.mockImplementation(async () => {
      const tempUri = 'file:///tmp/generated-report.pdf';
      fileContents.set(tempUri, new Uint8Array([1, 2, 3, 4]));
      return { uri: tempUri };
    });

    const result = await saveReportPdf(makeReport('Daily Progress'), {
      siteName: '',
    });

    expect(normalizeFileUri(result.pdfUri)).toBe(
      'file:///mock/cache/Harpa Pro/reports/site-reports/2026-04-20-daily-progress.pdf',
    );
  });

  it('regenerates the PDF each time save is requested', async () => {
    printToFileAsyncMock.mockImplementation(async () => {
      const tempUri = `file:///tmp/generated-save-${printToFileAsyncMock.mock.calls.length + 1}.pdf`;
      fileContents.set(tempUri, new Uint8Array([1, 2, 3, 4]));
      return { uri: tempUri };
    });

    await saveReportPdf(makeReport('Daily Progress'), {
      siteName: 'Riverside Tower',
    });
    await saveReportPdf(makeReport('Daily Progress'), {
      siteName: 'Riverside Tower',
    });

    expect(printToFileAsyncMock).toHaveBeenCalledTimes(2);
  });

  it('waits for the asynchronous SDK 56 move before completing the save', async () => {
    let releaseMove: (() => void) | undefined;
    moveBarrier.wait = new Promise<void>((resolve) => {
      releaseMove = resolve;
    });
    printToFileAsyncMock.mockImplementation(async () => {
      const tempUri = 'file:///tmp/generated-report.pdf';
      fileContents.set(tempUri, new Uint8Array([1, 2, 3, 4]));
      return { uri: tempUri };
    });

    let settled = false;
    const savePromise = saveReportPdf(makeReport('Daily Progress'), {
      siteName: 'Riverside Tower',
    }).then((result) => {
      settled = true;
      return result;
    });

    await vi.waitFor(() => expect(printToFileAsyncMock).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(settled).toBe(false);

    releaseMove?.();
    await savePromise;
    expect(settled).toBe(true);
  });

  it('refuses to save on web', async () => {
    platformMock.OS = 'web';
    await expect(
      saveReportPdf(makeReport('Daily Progress'), { siteName: 'Site' }),
    ).rejects.toThrow(/not supported on web/);
  });
});

describe('getSavedReportDetails', () => {
  it('describes the chosen folder and exposes the full saved path for the custom sheet UI', () => {
    const details = getSavedReportDetails({
      locationDescription:
        'Saved as daily-progress-1710000000000.pdf in documents/Harpa Pro/reports/riverside-tower.',
      pdfUri:
        'file:///mock/documents/Harpa Pro/reports/riverside-tower/daily-progress-1710000000000.pdf',
    });

    expect(details.title).toBe('PDF Saved');
    expect(details.locationDescription).toBe(
      'Saved as daily-progress-1710000000000.pdf in documents/Harpa Pro/reports/riverside-tower.',
    );
    expect(details.fullPath).toBe(
      '/mock/documents/Harpa Pro/reports/riverside-tower/daily-progress-1710000000000.pdf',
    );
    expect(details.openHint).toBe(
      "Open PDF uses your device's PDF handler for the saved file.",
    );
    expect(details.shareHint).toBe(
      'Share PDF sends the same file to another app.',
    );
  });
});

describe('openSavedReportPdf', () => {
  beforeEach(() => {
    openUrlMock.mockReset();
    platformMock.OS = 'ios';
  });

  it('opens the saved PDF directly with the file uri on iOS', async () => {
    openUrlMock.mockResolvedValue(undefined);

    await openSavedReportPdf(
      'file:///mock/documents/Harpa Pro/reports/riverside-tower/2026-04-20-daily-progress.pdf',
    );

    expect(openUrlMock).toHaveBeenCalledWith(
      'file:///mock/documents/Harpa Pro/reports/riverside-tower/2026-04-20-daily-progress.pdf',
    );
  });

  it('uses the content uri on Android so another app can handle the file', async () => {
    platformMock.OS = 'android';
    openUrlMock.mockResolvedValue(undefined);

    await openSavedReportPdf(
      'file:///mock/documents/Harpa Pro/reports/riverside-tower/2026-04-20-daily-progress.pdf',
    );

    expect(openUrlMock).toHaveBeenCalledWith(
      'content://mock/documents/Harpa Pro/reports/riverside-tower/2026-04-20-daily-progress.pdf',
    );
  });

  it('surfaces a friendly error when openURL fails', async () => {
    openUrlMock.mockRejectedValueOnce(new Error('no app installed'));
    await expect(openSavedReportPdf('file:///x.pdf')).rejects.toThrow(
      /Couldn't open the saved PDF/,
    );
  });
});

describe('shareSavedReportPdf', () => {
  beforeEach(() => {
    shareAvailableMock.mockReset();
    shareAsyncMock.mockReset();
  });

  it('reuses the native share sheet for a saved PDF', async () => {
    shareAvailableMock.mockResolvedValue(true);
    shareAsyncMock.mockResolvedValue(undefined);

    await shareSavedReportPdf({
      pdfUri: 'content://picked-folder/daily-progress.pdf',
      reportTitle: 'Daily Progress',
    });

    expect(shareAsyncMock).toHaveBeenCalledWith(
      'content://picked-folder/daily-progress.pdf',
      {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: 'Daily Progress',
      },
    );
  });

  it('throws a sharing-unavailable message when Sharing is disabled', async () => {
    shareAvailableMock.mockResolvedValue(false);
    await expect(
      shareSavedReportPdf({
        pdfUri: 'file:///x.pdf',
        reportTitle: 'Daily',
      }),
    ).rejects.toThrow(/sharing is not available/);
  });
});

describe('exportReportPdf', () => {
  beforeEach(() => {
    fileContents.clear();
    platformMock.OS = 'ios';
    printToFileAsyncMock.mockReset();
    shareAvailableMock.mockReset();
    shareAsyncMock.mockReset();
  });

  it('returns the saved file details and a share error message instead of raising a native alert', async () => {
    printToFileAsyncMock.mockImplementation(async () => {
      const tempUri = 'file:///tmp/generated-report.pdf';
      fileContents.set(tempUri, new Uint8Array([1, 2, 3, 4]));
      return { uri: tempUri };
    });
    shareAvailableMock.mockResolvedValue(false);

    const result = await exportReportPdf(makeReport('Daily Progress'), {
      siteName: 'Riverside Tower',
    });

    expect(normalizeFileUri(result.pdfUri)).toBe(
      'file:///mock/cache/Harpa Pro/reports/riverside-tower/2026-04-20-daily-progress.pdf',
    );
    expect(result.shareErrorMessage).toBe(
      'The PDF was generated, but sharing is not available on this device.',
    );
  });

  it('regenerates the PDF every time share is requested', async () => {
    printToFileAsyncMock.mockImplementation(async () => {
      const tempUri = `file:///tmp/generated-report-${printToFileAsyncMock.mock.calls.length + 1}.pdf`;
      fileContents.set(tempUri, new Uint8Array([1, 2, 3, 4]));
      return { uri: tempUri };
    });
    shareAvailableMock.mockResolvedValue(true);
    shareAsyncMock.mockResolvedValue(undefined);

    await exportReportPdf(makeReport('Daily Progress'), {
      siteName: 'Riverside Tower',
    });
    await exportReportPdf(makeReport('Daily Progress'), {
      siteName: 'Riverside Tower',
    });

    expect(printToFileAsyncMock).toHaveBeenCalledTimes(2);
    expect(shareAsyncMock).toHaveBeenCalledTimes(2);
  });

  it('propagates a PDF generation failure (does not silently swallow the error)', async () => {
    printToFileAsyncMock.mockRejectedValueOnce(
      new Error('printToFileAsync: out of memory'),
    );
    shareAvailableMock.mockResolvedValue(true);

    await expect(
      exportReportPdf(makeReport('Daily Progress'), {
        siteName: 'Riverside Tower',
      }),
    ).rejects.toThrow(/out of memory/);

    expect(shareAsyncMock).not.toHaveBeenCalled();
  });
});
