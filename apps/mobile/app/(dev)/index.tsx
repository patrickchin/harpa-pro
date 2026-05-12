/**
 * Dev-gallery index. Lists every screen registered in
 * `./registry.ts` and pushes the matching dev mirror on tap.
 *
 * Empty by design at the end of P2.0b — the first entry lands
 * with the first ported screen in P2.5.
 */
import { useRouter } from 'expo-router';

import { DevGallery } from '../../screens/dev-gallery';
import { buildGalleryRows } from '../../screens/dev-gallery.rows';
import { REGISTRY } from './registry';

export default function DevGalleryIndex() {
  const router = useRouter();
  const rows = buildGalleryRows(REGISTRY);
  return (
    <DevGallery
      rows={rows}
      onSelect={(href) => {
        // Cast because expo-router's typed Href accepts only known
        // routes; the gallery is a runtime registry of dev mirrors.
        router.push(href as never);
      }}
    />
  );
}
