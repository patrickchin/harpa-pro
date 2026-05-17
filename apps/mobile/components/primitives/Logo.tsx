import { Image, type ImageProps } from 'react-native';
import { cn } from '../../lib/utils';
import iconAsset from '../../assets/icon.png';

type Props = Omit<ImageProps, 'source'> & {
  className?: string;
};

/**
 * Brand mark for Harpa Pro. Renders the app icon asset so auth /
 * onboarding headers stay in sync with the iOS / Android app icon
 * (see `app.json` -> `icon` / `adaptiveIcon`).
 */
export function Logo({ className, accessibilityLabel, ...rest }: Props) {
  return (
    <Image
      source={iconAsset}
      accessibilityLabel={accessibilityLabel ?? 'Harpa Pro'}
      className={cn('h-12 w-12 rounded-lg', className)}
      resizeMode="contain"
      {...rest}
    />
  );
}
