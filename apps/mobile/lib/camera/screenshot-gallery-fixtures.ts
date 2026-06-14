import { Asset } from 'expo-asset';

import overheadFixture from '../../assets/fixtures/store-construction-overhead.jpg';
import homesFixture from '../../assets/fixtures/store-construction-homes.jpg';
import cementMixerFixture from '../../assets/fixtures/store-construction-cement-mixer.jpg';
import materialsPlatformFixture from '../../assets/fixtures/store-construction-materials-platform.jpg';
import rebarFoundationFixture from '../../assets/fixtures/store-construction-rebar-foundation.jpg';
import scaffoldingFixture from '../../assets/fixtures/store-construction-scaffolding.jpg';

const CONSTRUCTION_SITE_FIXTURES = [
  overheadFixture,
  homesFixture,
  cementMixerFixture,
  materialsPlatformFixture,
  rebarFoundationFixture,
  scaffoldingFixture,
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
