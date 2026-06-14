import { Asset } from 'expo-asset';

import overheadFixture from '../../assets/fixtures/store-construction-overhead.jpg';
import homesFixture from '../../assets/fixtures/store-construction-homes.jpg';

const CONSTRUCTION_SITE_FIXTURES = [
  overheadFixture,
  homesFixture,
] as const;

export async function resolveScreenshotGalleryFixtureUris(): Promise<string[]> {
  const assets = CONSTRUCTION_SITE_FIXTURES.map((moduleId) =>
    Asset.fromModule(moduleId),
  );
  await Promise.all(assets.map((asset) => asset.downloadAsync()));
  return assets
    .map((asset) => asset.localUri ?? asset.uri)
    .filter((uri): uri is string => uri.length > 0);
}
