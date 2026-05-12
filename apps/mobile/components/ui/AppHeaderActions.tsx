/**
 * Profile-button header action. Ported from
 * `../haru3-reports/apps/mobile/components/ui/AppHeaderActions.tsx` on
 * branch `dev`.
 *
 * Rendered inside `ScreenHeader` (gated by its `hideActions` prop).
 * Lives outside `components/primitives/` because it depends on
 * expo-router (routing-aware) and is not a generic styling primitive.
 *
 * Routing note (preserved verbatim from canonical): push /profile onto
 * the root Stack so a single iOS edge-swipe pops it. Profile used to
 * live inside (tabs) — that nested-Tabs-in-Stack arrangement caused
 * push/pop asymmetry. Promoting profile to a root Stack screen fixes
 * it; do NOT move it back into (tabs).
 */
import { View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { CircleUserRound } from 'lucide-react-native';

import { Button } from '@/components/primitives/Button';
import { colors } from '@/lib/design-tokens/colors';

function isActivePath(pathname: string, segment: string): boolean {
  return pathname === segment || pathname.endsWith(segment);
}

export function AppHeaderActions() {
  const router = useRouter();
  const pathname = usePathname();
  const isProfileActive =
    isActivePath(pathname, '/profile') ||
    isActivePath(pathname, '/account') ||
    isActivePath(pathname, '/usage');

  return (
    <View className="flex-row items-center">
      <Button
        variant={isProfileActive ? 'secondary' : 'outline'}
        size="default"
        className="px-4"
        testID="btn-open-profile"
        accessibilityLabel="Open profile"
        onPress={() => {
          if (isProfileActive) return;
          // Cast: /profile is added by the (app) shell in P2.6. Until that
          // route exists, expo-router's typed-routes table doesn't include
          // it. Once P2.6 lands, this cast can drop.
          router.push('/profile' as unknown as Href);
        }}
      >
        <View className="items-center justify-center">
          <CircleUserRound size={16} color={colors.foreground} />
        </View>
      </Button>
    </View>
  );
}
