/**
 * UploadQueueStrip — selection + interaction coverage.
 *
 * Drives the strip via the real `useFileUpload()` hook bound to a
 * hand-built `UploadQueue` injected through `<QueueProvider>`. No DI
 * stubbing of the hook itself (Pitfall 13 — the hook's selector logic
 * is part of what we're verifying).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { UploadQueueStrip } from './UploadQueueStrip';
import { QueueProvider } from '@/lib/uploads/QueueProvider';
import type {
  EnqueueInput,
  UploadJob,
  UploadResult,
} from '@/lib/uploads/types';
import type { UploadQueue } from '@/lib/uploads/queue';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) =>
    React.createElement('rn-expo-image', props, null),
}));

function inputOf(overrides: Partial<EnqueueInput> = {}): EnqueueInput {
  return {
    sourceUri: 'file:///tmp/a.jpg',
    kind: 'image',
    filename: 'a.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 1000,
    reportId: 'rpt_1',
    ...overrides,
  };
}

function jobOf(overrides: Partial<UploadJob> = {}): UploadJob {
  return {
    id: 'job_1',
    input: inputOf(),
    status: 'uploading',
    progress: 0.5,
    attempt: 1,
    ...overrides,
  };
}

function fakeQueue(initial: UploadJob[]): UploadQueue & {
  retrySpy: ReturnType<typeof vi.fn>;
  removeSpy: ReturnType<typeof vi.fn>;
} {
  let jobs = initial.slice();
  const listeners = new Set<() => void>();
  const retrySpy = vi.fn(
    async (id: string): Promise<UploadResult> => {
      jobs = jobs.map((j) =>
        j.id === id ? { ...j, status: 'uploading', error: undefined } : j,
      );
      listeners.forEach((l) => l());
      return { file: { id: 'fil_1' } as never };
    },
  );
  const removeSpy = vi.fn((id: string) => {
    jobs = jobs.filter((j) => j.id !== id);
    listeners.forEach((l) => l());
  });
  return {
    enqueue: async () => ({ file: { id: 'fil_1' } as never }),
    retry: retrySpy,
    remove: removeSpy,
    getJobs: () => jobs,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    retrySpy,
    removeSpy,
  };
}

function render(
  jobs: UploadJob[],
  reportId?: string,
): {
  tree: ReactTestRenderer;
  queue: ReturnType<typeof fakeQueue>;
} {
  const queue = fakeQueue(jobs);
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <QueueProvider queue={queue}>
        <UploadQueueStrip reportId={reportId} />
      </QueueProvider>,
    );
  });
  return { tree, queue };
}

describe('UploadQueueStrip', () => {
  it('renders nothing when there are no active or failed jobs', () => {
    const { tree } = render([
      jobOf({ id: 'j_done', status: 'completed', progress: 1 }),
    ]);
    expect(
      tree.root.findAllByProps({ testID: 'upload-queue-strip' }),
    ).toHaveLength(0);
  });

  it('shows aggregated active progress and pluralises the count', () => {
    const { tree } = render([
      jobOf({ id: 'j1', status: 'uploading', progress: 0.4 }),
      jobOf({ id: 'j2', status: 'uploading', progress: 0.8 }),
    ]);
    const summary = tree.root.findByProps({
      testID: 'upload-queue-strip-active-summary',
    });
    expect(
      String(
        Array.isArray(summary.props.children)
          ? summary.props.children.join('')
          : summary.props.children,
      ).replace(/\s+/g, ' '),
    ).toContain('Uploading 2 photos');
    const bar = tree.root.findByProps({
      testID: 'upload-queue-strip-progress',
    });
    expect(bar.props.accessibilityValue.now).toBe(60);
  });

  it('lists failed jobs with retry/dismiss chips that call the queue', () => {
    const { tree, queue } = render([
      jobOf({
        id: 'fj',
        status: 'failed',
        progress: 0,
        error: 'Network unreachable',
        input: inputOf({ filename: 'photo-1.jpg' }),
      }),
      jobOf({
        id: 'fj2',
        status: 'failed',
        progress: 0,
        error: 'Timeout',
        input: inputOf({ filename: 'photo-2.jpg' }),
      }),
    ]);
    const retry = tree.root.findByProps({
      testID: 'btn-upload-queue-strip-retry-0',
    });
    act(() => {
      retry.props.onPress();
    });
    expect(queue.retrySpy).toHaveBeenCalledWith('fj');
    // After retry, fj moves to uploading; the failed strip now contains
    // a single chip for fj2 at index 0.
    const dismiss = tree.root.findByProps({
      testID: 'btn-upload-queue-strip-dismiss-0',
    });
    act(() => {
      dismiss.props.onPress();
    });
    expect(queue.removeSpy).toHaveBeenCalledWith('fj2');
  });

  it('filters jobs by reportId when provided', () => {
    const { tree } = render(
      [
        jobOf({ id: 'mine', status: 'uploading', input: inputOf({ reportId: 'rpt_1' }) }),
        jobOf({ id: 'other', status: 'uploading', input: inputOf({ reportId: 'rpt_2' }) }),
      ],
      'rpt_1',
    );
    const summary = tree.root.findByProps({
      testID: 'upload-queue-strip-active-summary',
    });
    expect(
      String(
        Array.isArray(summary.props.children)
          ? summary.props.children.join('')
          : summary.props.children,
      ).replace(/\s+/g, ' '),
    ).toContain('Uploading 1 photo');
  });
});
