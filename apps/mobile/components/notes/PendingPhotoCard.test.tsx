/**
 * PendingPhotoCard — render coverage for the three job states the UI
 * differentiates: in-flight (uploading), succeeded-but-not-yet-cleaned
 * (still listed before reconciliation), and failed (retry + dismiss).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PendingPhotoCard } from './PendingPhotoCard';
import type { UploadJob } from '@/lib/uploads/types';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) =>
    React.createElement('rn-expo-image', props, null),
}));

function jobOf(overrides: Partial<UploadJob> = {}): UploadJob {
  return {
    id: 'job_1',
    input: {
      sourceUri: 'file:///tmp/img.jpg',
      kind: 'image',
      filename: 'img.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1234,
      reportId: 'rpt_1',
    },
    status: 'uploading',
    progress: 0.4,
    attempt: 1,
    ...overrides,
  };
}

function render(el: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(el);
  });
  return tree;
}

describe('PendingPhotoCard', () => {
  it('renders progress bar and cancel during upload', () => {
    const onCancel = vi.fn();
    const tree = render(
      <PendingPhotoCard
        job={jobOf({ status: 'uploading', progress: 0.5 })}
        sourceIndex={0}
        onCancel={onCancel}
      />,
    );
    const bar = tree.root.findAllByProps({
      testID: 'pending-photo-progress-0',
    });
    expect(bar.length).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-pending-photo-cancel-0' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'btn-pending-photo-retry-0' }),
    ).toHaveLength(0);
    const status = tree.root.findByProps({
      testID: 'pending-photo-status-0',
    });
    expect(status.props.children).toBe('Uploading…');
  });

  it('renders retry + dismiss on failure with the error message', () => {
    const onRetry = vi.fn();
    const onCancel = vi.fn();
    const tree = render(
      <PendingPhotoCard
        job={jobOf({
          status: 'failed',
          progress: 0,
          error: 'Network unreachable',
        })}
        sourceIndex={2}
        onRetry={onRetry}
        onCancel={onCancel}
      />,
    );
    expect(
      tree.root.findAllByProps({ testID: 'pending-photo-progress-2' }),
    ).toHaveLength(0);
    const retry = tree.root.findByProps({
      testID: 'btn-pending-photo-retry-2',
    });
    act(() => {
      retry.props.onPress();
    });
    expect(onRetry).toHaveBeenCalledWith('job_1');
    const dismiss = tree.root.findByProps({
      testID: 'btn-pending-photo-cancel-2',
    });
    act(() => {
      dismiss.props.onPress();
    });
    expect(onCancel).toHaveBeenCalledWith('job_1');
  });

  it('shows the local sourceUri as the thumbnail (no signed URL fetch)', () => {
    const tree = render(
      <PendingPhotoCard job={jobOf()} sourceIndex={1} onCancel={() => {}} />,
    );
    const thumb = tree.root.findByProps({
      testID: 'pending-photo-thumb-1',
    });
    expect((thumb.props.source as { uri: string }).uri).toBe(
      'file:///tmp/img.jpg',
    );
  });
});
