import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const inlineRecorderMock = vi.hoisted(() => {
  const friendly = "Couldn't start recording. Please try again.";
  return {
    friendly,
    current: {
      isRecording: false,
      snapshot: { status: 'idle', durationMs: 0, amplitude: 0 },
      historyBars: [] as number[],
      permission: 'unknown',
      error: null as string | null,
      userErrorMessage: null as string | null,
      start: vi.fn(async () => {}),
      stopAndCapture: vi.fn(async () => null),
      cancel: vi.fn(async () => {}),
      dismissError: vi.fn(),
    },
  };
});

const voicePipelineMock = vi.hoisted(() => ({
  state: {
    step: 'idle',
    failedStep: null,
    error: null,
    note: null,
    fileId: null,
    capture: null,
    usageLimit: null,
  },
  capture: vi.fn(async () => null),
  retry: vi.fn(async () => null),
  reset: vi.fn(),
}));

const photoUploadsMock = vi.hoisted(() => ({
  entries: [],
  noteIdToSyntheticId: new Map<string, string>(),
  fileIdToAttachmentKey: new Map<string, string>(),
  retry: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('@/features/voice/useInlineRecorder', () => ({
  RECORDER_START_FAILED_MESSAGE: inlineRecorderMock.friendly,
  useInlineRecorder: () => inlineRecorderMock.current,
}));

vi.mock('@/features/voice/useVoiceNotePipeline', () => ({
  useVoiceNotePipeline: () => voicePipelineMock,
}));

vi.mock('@/lib/audio/AudioPlaybackProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/audio/AudioPlaybackProvider')>();
  return {
    ...actual,
    useAudioPlayback: () => ({
      play: vi.fn(async () => {}),
      pause: vi.fn(),
      stop: vi.fn(),
      seek: vi.fn(async () => {}),
      status: { uri: null, playing: false, positionSec: 0, durationSec: 0 },
    }),
  };
});

vi.mock('@/lib/api/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/hooks')>();
  return {
    ...actual,
    useMeQuery: () => ({ data: { user: { id: 'usr_test' } }, isLoading: false, isError: false }),
  };
});

vi.mock('@/lib/uploads/usePhotoUploadEntries', () => ({
  usePhotoUploadEntries: () => photoUploadsMock,
}));

import { GenerateReportProvider } from './GenerateReportProvider';

let tree: TestRenderer.ReactTestRenderer | null = null;

function renderProvider() {
  act(() => {
    tree = TestRenderer.create(
      <GenerateReportProvider
        project="prj_test"
        reportNumber={1}
        reportId="rep_test"
        notes={[]}
      >
        <></>
      </GenerateReportProvider>,
    );
  });
  return tree!;
}

function collectText(n: unknown): string {
  if (n == null) return '';
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map(collectText).join(' ');
  const node = n as { children?: unknown };
  if (node.children !== undefined) return collectText(node.children);
  return '';
}

describe('GenerateReportProvider recorder errors', () => {
  beforeEach(() => {
    inlineRecorderMock.current.error = null;
    inlineRecorderMock.current.userErrorMessage = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (tree) {
      act(() => {
        tree!.unmount();
      });
      tree = null;
    }
  });

  it('shows friendly recorder-start failure copy instead of the raw native exception', () => {
    const rawNativeMessage =
      "Calling the 'prepareToRecordAsync' function has failed -> Caused by: Audio recording error: Failed to prepare recorder";
    inlineRecorderMock.current.error = rawNativeMessage;
    inlineRecorderMock.current.userErrorMessage = inlineRecorderMock.friendly;

    const text = collectText(renderProvider().toJSON());

    expect(text).toContain('Recording failed');
    expect(text).toContain(inlineRecorderMock.friendly);
    expect(text).not.toContain('prepareToRecordAsync');
    expect(text).not.toContain('Failed to prepare recorder');
  });
});
