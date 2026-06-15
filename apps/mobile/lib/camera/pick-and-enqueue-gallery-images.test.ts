/**
 * pickAndEnqueueGalleryImages — gallery attachment-sheet contract.
 *
 * Drives the real `expo-image-picker` mock from `vitest.setup.ts` and
 * a spy `enqueueCameraUris`. Covers the four observable outcomes:
 * permission-denied / cancelled / empty / enqueued.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as ImagePicker from 'expo-image-picker';

import { pickAndEnqueueGalleryImages } from './pick-and-enqueue-gallery-images';
import type { UploadResult } from '@/lib/uploads/types';

const PERM_DENIED = {
  granted: false,
  canAskAgain: false,
  status: 'denied',
};
const PERM_GRANTED = {
  granted: true,
  canAskAgain: true,
  status: 'granted',
};

const fakeFile = { id: 'fil_1' } as unknown as UploadResult['file'];

describe('pickAndEnqueueGalleryImages', () => {
  beforeEach(() => {
    vi.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(
      PERM_GRANTED as never,
    );
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///tmp/a.jpg',
          width: 800,
          height: 600,
          type: 'image',
          mimeType: 'image/jpeg',
          fileSize: 100_000,
        },
        {
          uri: 'file:///tmp/b.jpg',
          width: 800,
          height: 600,
          type: 'image',
          mimeType: 'image/jpeg',
          fileSize: 100_000,
        },
      ],
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns permission-denied without launching the picker', async () => {
    vi.mocked(
      ImagePicker.requestMediaLibraryPermissionsAsync,
    ).mockResolvedValueOnce(PERM_DENIED as never);
    const enqueue = vi.fn();
    const outcome = await pickAndEnqueueGalleryImages({
      reportId: 'rpt_1',
      projectId: 'prj-test1234',
      enqueueCameraUris: enqueue,
    });
    expect(outcome.kind).toBe('permission-denied');
    expect(enqueue).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('returns cancelled when the user cancels the picker', async () => {
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: true,
      assets: null,
    } as never);
    const enqueue = vi.fn();
    const outcome = await pickAndEnqueueGalleryImages({
      reportId: 'rpt_1',
      projectId: 'prj-test1234',
      enqueueCameraUris: enqueue,
    });
    expect(outcome.kind).toBe('cancelled');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('returns empty when no usable assets come back', async () => {
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [],
    } as never);
    const enqueue = vi.fn();
    const outcome = await pickAndEnqueueGalleryImages({
      reportId: 'rpt_1',
      projectId: 'prj-test1234',
      enqueueCameraUris: enqueue,
    });
    expect(outcome.kind).toBe('empty');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('enqueues every selected URI and forwards the settlement', async () => {
    const settlement: PromiseSettledResult<UploadResult>[] = [
      { status: 'fulfilled', value: { file: fakeFile } },
      { status: 'rejected', reason: new Error('boom') },
    ];
    const enqueue = vi.fn(async () => settlement);
    const outcome = await pickAndEnqueueGalleryImages({
      reportId: 'rpt_1',
      projectId: 'prj-test1234',
      enqueueCameraUris: enqueue,
    });
    expect(enqueue).toHaveBeenCalledWith(
      ['file:///tmp/a.jpg', 'file:///tmp/b.jpg'],
      { reportId: 'rpt_1', projectId: 'prj-test1234', noteSource: 'gallery' },
    );
    expect(outcome).toEqual({
      kind: 'enqueued',
      total: 2,
      results: settlement,
    });
  });

  it('uses an explicit screenshot fixture resolver without launching the system picker', async () => {
    const settlement: PromiseSettledResult<UploadResult>[] = [
      { status: 'fulfilled', value: { file: fakeFile } },
      { status: 'fulfilled', value: { file: fakeFile } },
    ];
    const enqueue = vi.fn(async () => settlement);
    const outcome = await pickAndEnqueueGalleryImages({
      reportId: 'rpt_1',
      projectId: 'prj-test1234',
      enqueueCameraUris: enqueue,
      screenshotMode: true,
      resolveScreenshotFixtureUris: async () => [
        'file:///fixtures/concrete.jpg',
        'file:///fixtures/scaffold.jpg',
      ],
    });

    expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith(
      ['file:///fixtures/concrete.jpg', 'file:///fixtures/scaffold.jpg'],
      { reportId: 'rpt_1', projectId: 'prj-test1234', noteSource: 'gallery' },
    );
    expect(outcome).toEqual({
      kind: 'enqueued',
      total: 2,
      results: settlement,
    });
  });

  it('returns empty in screenshot mode when no fixture resolver is provided', async () => {
    const enqueue = vi.fn();
    const outcome = await pickAndEnqueueGalleryImages({
      reportId: 'rpt_1',
      projectId: 'prj-test1234',
      enqueueCameraUris: enqueue,
      screenshotMode: true,
    });

    expect(outcome).toEqual({ kind: 'empty' });
    expect(enqueue).not.toHaveBeenCalled();
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });
});
