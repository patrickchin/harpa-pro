/**
 * IconButton primitive — square or circular icon-only button with
 * standardised dimensions, radius, surface depth, and pressed state.
 *
 * Pitfall: in v3, icon-only buttons were bespoke Pressables across
 * the app (header back, modal close, toolbar actions, inline list
 * delete, etc.). Standardising them late (`haru3-reports@48c5dee`,
 * "standardize icon-only buttons with shared IconButton primitive")
 * required rewriting ~12 component sites — see docs/v4/pitfalls.md
 * §Pitfall 3. v4 ships IconButton early so every icon-only tap
 * target uses it from day one.
 *
 * The canonical port source at `../haru3-reports/apps/mobile@dev`
 * does NOT have a dedicated IconButton — instead it inlines
 * `<Button size="icon" variant="ghost">` everywhere. We keep the
 * dedicated primitive for v4 because (a) the v3 standardisation
 * commit is exactly the bug we're trying to avoid, and (b) the
 * IconButton API enforces accessibilityLabel + hitSlop on every
 * icon button, which `<Button size="icon">` does not.
 *
 * v3 used Unistyles for its IconButton (banned by hard rule #5 — see
 * pitfalls.md). This port translates the v3 stylesheet to NativeWind
 * classes; the variant / size / shape API is preserved.
 */
import { Pressable, View, type PressableProps } from 'react-native';
import { cn } from '@/lib/utils';
import { getSurfaceDepthStyle, type SurfaceDepth } from '@/lib/surface-depth';

export type IconButtonVariant = 'outline' | 'ghost' | 'muted' | 'primary' | 'destructive';
export type IconButtonSize = 'xs' | 'sm' | 'default';
export type IconButtonShape = 'square' | 'circle';

export interface IconButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  children: React.ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  shape?: IconButtonShape;
  className?: string;
}

const variantStyles: Record<IconButtonVariant, string> = {
  outline: 'border border-border bg-card active:opacity-90',
  ghost: 'bg-transparent active:bg-secondary',
  muted: 'bg-surface-muted active:opacity-90',
  primary: 'bg-primary active:opacity-85',
  destructive: 'bg-destructive active:opacity-85',
};

const squareSizeStyles: Record<IconButtonSize, string> = {
  // Width / height in px to match v3 dimensions (28 / 36 / 44).
  xs: 'h-7 w-7 rounded-md',
  sm: 'h-9 w-9 rounded-md',
  default: 'h-touch w-touch rounded-lg',
};

const circleSizeStyles: Record<IconButtonSize, string> = {
  xs: 'h-7 w-7 rounded-full',
  sm: 'h-9 w-9 rounded-full',
  default: 'h-touch w-touch rounded-full',
};

const variantDepth: Record<IconButtonVariant, SurfaceDepth> = {
  outline: 'raised',
  ghost: 'flat',
  muted: 'flat',
  primary: 'raised',
  destructive: 'raised',
};

export function IconButton({
  children,
  variant = 'outline',
  size = 'default',
  shape = 'square',
  className,
  disabled,
  hitSlop = 8,
  accessibilityRole = 'button',
  ...props
}: IconButtonProps) {
  const sizeClass = shape === 'circle' ? circleSizeStyles[size] : squareSizeStyles[size];
  return (
    <Pressable
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      style={getSurfaceDepthStyle(variantDepth[variant])}
      className={cn(
        'items-center justify-center',
        sizeClass,
        variantStyles[variant],
        disabled && 'opacity-50',
        className,
      )}
      {...props}
    >
      <View className="items-center justify-center">{children}</View>
    </Pressable>
  );
}
