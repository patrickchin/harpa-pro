/**
 * Deterministic camera input for fixture builds.
 *
 * The app icon is already bundled in every build. Each shutter press copies
 * it to a unique cache file so CameraCapture retains its normal temporary-file
 * ownership semantics and downstream image processing receives a real local
 * URI. The copied bytes are decoded by expo-image / expo-image-manipulator;
 * the `.jpg` destination name matches the JPEG emitted by the upload pipeline.
 */
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';

import fixtureCameraImage from '@/assets/icon.png';
import { uuid } from '@/lib/util/uuid';

const FIXTURE_WIDTH = 1024;
const FIXTURE_HEIGHT = 1024;

export interface FixtureCameraPicture {
  uri: string;
  width: number;
  height: number;
}

export async function takeFixtureCameraPicture(): Promise<FixtureCameraPicture> {
  const [asset] = await Asset.loadAsync(fixtureCameraImage);
  if (!asset?.localUri) {
    throw new Error('fixture-camera: failed to materialize the bundled image');
  }

  const destination = new File(Paths.cache, `harpa-camera-fixture-${uuid()}.jpg`);
  new File(asset.localUri).copy(destination);

  return {
    uri: destination.uri,
    width: FIXTURE_WIDTH,
    height: FIXTURE_HEIGHT,
  };
}
