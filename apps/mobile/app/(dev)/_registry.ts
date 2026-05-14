/**
 * Dev-gallery registry.
 *
 * Add an entry here every time a new screen body lands in
 * `apps/mobile/screens/<name>.tsx` and a dev mirror lands at
 * `apps/mobile/app/(dev)/<name>.tsx`. The order is irrelevant —
 * `buildGalleryRows` groups + sorts at render time.
 *
 * Empty by design at the end of P2.0b. Populated incrementally
 * across P2.5–P2.7 (auth screens, app shell, projects list) and
 * throughout P3 (per-feature screens).
 */
import type { GalleryEntry } from '../../screens/dev-gallery.rows';

export const REGISTRY: readonly GalleryEntry[] = [
  {
    name: 'Button',
    href: '/(dev)/primitives/button',
    group: 'primitives',
    description: 'Variants, sizes, loading + disabled states',
  },
  {
    name: 'IconButton',
    href: '/(dev)/primitives/icon-button',
    group: 'primitives',
    description: 'Square / circle icon-only buttons (xs / sm / default)',
  },
  {
    name: 'Input',
    href: '/(dev)/primitives/input',
    group: 'primitives',
    description: 'Label / hint / error / read-only states',
  },
  {
    name: 'Card',
    href: '/(dev)/primitives/card',
    group: 'primitives',
    description: 'Surface container — variants + padding steps',
  },
  {
    name: 'ScreenHeader',
    href: '/(dev)/primitives/screen-header',
    group: 'primitives',
    description: 'Title / eyebrow / subtitle / back / actions',
  },
  {
    name: 'EmptyState',
    href: '/(dev)/primitives/empty-state',
    group: 'primitives',
    description: 'Muted-card zero state with icon / action slots',
  },
  {
    name: 'Skeleton',
    href: '/(dev)/primitives/skeleton',
    group: 'primitives',
    description: 'Pulsing placeholder blocks + SkeletonRow flex layout',
  },
  {
    name: 'StatTile',
    href: '/(dev)/primitives/stat-tile',
    group: 'primitives',
    description: 'Dashboard metric tile — default / warning / danger / success / compact',
  },
  {
    name: 'InlineNotice',
    href: '/(dev)/primitives/inline-notice',
    group: 'primitives',
    description: 'Tone-driven banner — info / success / warning / danger',
  },
  {
    name: 'AppDialogSheet',
    href: '/(dev)/primitives/app-dialog-sheet',
    group: 'primitives',
    description: 'In-app modal sheet replacing Alert.alert',
  },
  {
    name: 'Sign-in Phone',
    href: '/(dev)/sign-in-phone',
    group: 'auth',
    description: 'Phone number entry — step 1 of OTP flow',
  },
  {
    name: 'Sign-in Verify',
    href: '/(dev)/sign-in-verify',
    group: 'auth',
    description: 'OTP verification — step 2 of OTP flow',
  },
  {
    name: 'Sign-up Phone',
    href: '/(dev)/sign-up-phone',
    group: 'auth',
    description: 'Phone number entry — step 1 of sign-up flow',
  },
  {
    name: 'Sign-up Verify',
    href: '/(dev)/sign-up-verify',
    group: 'auth',
    description: 'OTP verification — step 2 of sign-up flow',
  },
  {
    name: 'Onboarding',
    href: '/(dev)/onboarding',
    group: 'auth',
    description: 'Post-OTP identity collection — full name + company',
  },
  {
    name: 'Projects List',
    href: '/(dev)/projects-list',
    group: 'app',
    description: 'Projects list — empty / loading / populated states with pull-to-refresh',
  },
  {
    name: 'New Project',
    href: '/(dev)/project-new',
    group: 'app',
    description: 'New project form — idle / pending / error states',
  },
  {
    name: 'Project Home',
    href: '/(dev)/project-home',
    group: 'app',
    description: 'Project overview — loaded / loading / empty states',
  },
  {
    name: 'Edit Project',
    href: '/(dev)/project-edit',
    group: 'app',
    description: 'Edit project form — loaded / loading / updating / deleting / error',
  },
  {
    name: 'Project Members',
    href: '/(dev)/project-members',
    group: 'app',
    description: 'Members — owner / editor / viewer / empty / loading views',
  },
];
