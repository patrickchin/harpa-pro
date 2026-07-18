/**
 * ScreenHeader primitive. Ported from
 * `../haru3-reports/apps/mobile/components/ui/ScreenHeader.tsx` on
 * branch `dev`.
 *
 * Pitfall reference: v3 fix `haru3-reports@db0b97c`
 * ("add small top padding to ScreenHeader"). Canonical resolves it by
 * using `min-h-touch` on the inner row (which gives the visual gap the
 * v3 fix was after) plus an outer `gap-3`. Do NOT remove `min-h-touch`
 * to "save space" — that's the bug the fix landed for.
 *
 * Routing decoupling: the canonical source imports `AppHeaderActions`
 * (an expo-router-aware profile button) directly. We accept it as an
 * `actions` slot instead so the primitive stays pure — no expo-router
 * import — and snapshot tests don't have to mock the router. Routes
 * pass `<AppHeaderActions />` from `components/ui/AppHeaderActions`.
 */
import { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';

import { cn } from '@/lib/util/utils';
import { Button } from './Button';
import { colors } from '@/lib/design-tokens/colors';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  backLabel?: string;
  onBack?: () => void;
  trailing?: ReactNode;
  titleAccessory?: ReactNode;
  className?: string;
  /**
   * Action slot rendered at the trailing edge of the header row.
   * Routes typically pass `<AppHeaderActions />` (profile button);
   * dev mirrors and detail screens that opt out leave it unset.
   */
  actions?: ReactNode;
  /** Override the default `screen-header-title` testID on the title Text. */
  titleTestID?: string;
  /** Put the title below the controls and allow user-authored text to wrap. */
  stackedTitle?: boolean;
}

export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  backLabel,
  onBack,
  trailing,
  titleAccessory,
  className,
  actions,
  titleTestID,
  stackedTitle = false,
}: ScreenHeaderProps) {
  const hasSupportingRow = Boolean(eyebrow || subtitle || titleAccessory);

  return (
    <View className={cn('gap-3', className)}>
      {/* Top padding lives in min-h-touch — see Pitfall v3 db0b97c. */}
      <View className="min-h-touch flex-row items-center gap-3">
        {onBack ? (
          <Button
            testID="btn-back"
            onPress={onBack}
            variant="outline"
            size="default"
            className="px-4"
            accessibilityRole="button"
            accessibilityLabel={backLabel ? `Back to ${backLabel}` : 'Back'}
          >
            <ArrowLeft size={16} color={colors.foreground} />
          </Button>
        ) : null}

        {stackedTitle ? (
          <View className="min-w-0 flex-1" />
        ) : (
          <Text
            testID={titleTestID ?? 'screen-header-title'}
            className="min-w-0 flex-1 text-title-sm text-foreground"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
        )}

        <View className="shrink-0 flex-row items-center gap-2">
          {trailing ? <View>{trailing}</View> : null}
          {actions ? <View>{actions}</View> : null}
        </View>
      </View>

      {stackedTitle ? (
        <View testID="report-title-row" className="w-full">
          <Text
            testID={titleTestID ?? 'screen-header-title'}
            className="w-full text-title-sm text-foreground"
            selectable
          >
            {title}
          </Text>
        </View>
      ) : null}

      {hasSupportingRow ? (
        <View className="gap-1">
          {eyebrow ? (
            <Text className="text-label text-muted-foreground" selectable>
              {eyebrow}
            </Text>
          ) : null}
          {subtitle ? (
            <Text className="text-body text-muted-foreground" selectable>
              {subtitle}
            </Text>
          ) : null}
          {titleAccessory ? <View>{titleAccessory}</View> : null}
        </View>
      ) : null}
    </View>
  );
}
