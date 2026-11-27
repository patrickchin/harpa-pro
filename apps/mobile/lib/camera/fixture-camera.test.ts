import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Asset } from 'expo-asset';

const uuidSpy = vi.hoisted(() => vi.fn());

vi.mock('@/lib/util/uuid', () => ({ uuid: uuidSpy }));

import { takeFixtureCameraPicture } from './fixture-camera';

describe('takeFixtureCameraPicture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidSpy.mockReturnValue('00000000-0000-4000-8000-000000000001');
    vi.mocked(Asset.loadAsync).mockResolvedValue([
      {
        localUri: 'file:///bundle/icon.png',
        uri: 'asset:///icon.png',
      },
    ] as never);
  });

  it('copies the bundled image to a unique cache-backed capture URI', async () => {
    const first = await takeFixtureCameraPicture();
    uuidSpy.mockReturnValue('00000000-0000-4000-8000-000000000002');
    const second = await takeFixtureCameraPicture();

    expect(first).toEqual({
      uri: 'file:///mock/cache/harpa-camera-fixture-00000000-0000-4000-8000-000000000001.jpg',
      width: 1024,
      height: 1024,
    });
    expect(second.uri).toBe(
      'file:///mock/cache/harpa-camera-fixture-00000000-0000-4000-8000-000000000002.jpg',
    );
    expect(second.uri).not.toBe(first.uri);
    expect(Asset.loadAsync).toHaveBeenCalledTimes(2);
  });

  it('fails closed when Expo cannot materialize a local asset', async () => {
    vi.mocked(Asset.loadAsync).mockResolvedValueOnce([{ uri: 'asset:///icon.png' }] as never);

    await expect(takeFixtureCameraPicture()).rejects.toThrow(
      'fixture-camera: failed to materialize the bundled image',
    );
  });
});
