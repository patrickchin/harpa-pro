/**
 * Button primitive. Ported from
 * `../haru3-reports/apps/mobile/components/ui/Button.tsx` on branch
 * `dev` — the canonical port source.
 *
 * NativeWind v4 styles. Spinner / disabled hex literals route through
 * `lib/design-tokens/colors` so there are no raw hex strings in
 * `components/` (Pitfall 3, `check-no-hex-colors.sh`).
 *
 * Variants:
 *   default | secondary | destructive | outline | ghost | quiet | hero
 * Sizes:
 *   default (44 min) | sm | lg | xl (52 min) | icon (square 44)
 */
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { cn } from '@/lib/utils';
import { getSurfaceDepthStyle, type SurfaceDepth } from '@/lib/surface-depth';
import { colors } from '@/lib/design-tokens/colors';

export type ButtonVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'ghost'
  | 'quiet'
  | 'hero';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'xl' | 'icon';

export interface ButtonProps extends PressableProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Inline spinner next to the label. Disables the button. */
  loading?: boolean;
  className?: string;
  textClassName?: string;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  default: 'border border-primary bg-primary active:opacity-85',
  secondary: 'border border-border bg-secondary active:opacity-90',
  destructive: 'border border-danger-border bg-danger-soft active:opacity-85',
  outline: 'border border-border bg-card active:opacity-90',
  ghost: 'bg-transparent active:bg-secondary',
  quiet: 'bg-transparent active:bg-secondary',
  hero: 'border border-accent bg-accent active:opacity-85',
};

const variantTextStyles: Record<ButtonVariant, string> = {
  default: 'text-primary-foreground font-semibold',
  secondary: 'text-foreground font-semibold',
  destructive: 'text-danger-text font-semibold',
  outline: 'text-foreground font-semibold',
  ghost: 'text-foreground font-semibold',
  quiet: 'text-muted-foreground font-semibold',
  hero: 'text-accent-foreground font-semibold',
};

const sizeStyles: Record<ButtonSize, string> = {
  default: 'min-h-touch px-4 py-3',
  sm: 'min-h-10 px-3 py-2.5',
  lg: 'min-h-touch px-5 py-3.5',
  xl: 'min-h-touch-lg px-6 py-4',
  icon: 'h-touch w-touch items-center justify-center',
};

const sizeTextStyles: Record<ButtonSize, string> = {
  default: 'text-base',
  sm: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg',
  icon: 'text-base',
};

const depthStyles: Record<ButtonVariant, SurfaceDepth> = {
  default: 'raised',
  secondary: 'raised',
  destructive: 'raised',
  outline: 'raised',
  ghost: 'flat',
  quiet: 'flat',
  hero: 'floating',
};

function mergePressableStyles(
  baseStyle: ViewStyle,
  style: PressableProps['style'],
): StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>) {
  if (typeof style === 'function') {
    return (state) => [baseStyle, style(state)];
  }
  return [baseStyle, style];
}

// Spinner colors per variant — resolved through the colors token to keep
// `check-no-hex-colors.sh` clean.
const SPINNER_COLORS: Partial<Record<ButtonVariant, string>> = {
  default: colors.primary.foreground,
  hero: colors.accent.foreground,
  destructive: colors.danger.text,
};

export function Button({
  variant = 'default',
  size = 'default',
  loading = false,
  className,
  textClassName,
  children,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const baseStyle = getSurfaceDepthStyle(depthStyles[variant]);
  const isDisabled = disabled || loading;
  const spinnerColor = SPINNER_COLORS[variant] ?? colors.foreground;

  return (
    <Pressable
      className={cn(
        'flex-row items-center justify-center rounded-md',
        variantStyles[variant],
        sizeStyles[size],
        isDisabled && 'opacity-50',
        className,
      )}
      style={mergePressableStyles(baseStyle, style)}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color={spinnerColor} />
          {typeof children === 'string' ? (
            <Text className={cn(variantTextStyles[variant], sizeTextStyles[size], textClassName)}>
              {children}
            </Text>
          ) : (
            children
          )}
        </View>
      ) : typeof children === 'string' ? (
        <Text className={cn(variantTextStyles[variant], sizeTextStyles[size], textClassName)}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
