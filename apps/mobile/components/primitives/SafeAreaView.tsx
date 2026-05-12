/**
 * SafeAreaView — JS-context-aware drop-in replacement for the
 * react-native-safe-area-context `SafeAreaView`.
 *
 * The library's own `SafeAreaView` is a thin wrapper around the *native*
 * `NativeSafeAreaView`, which reads insets directly from the platform and
 * ignores any `SafeAreaInsetsContext.Provider` we install above it.
 *
 * Screens use this wrapper instead, which derives padding from
 * `useSafeAreaInsets()` — which *does* respect
 * `SafeAreaInsetsContext.Provider`. This used to be required by the
 * (now-removed) `ConnectionBanner` so descendants didn't double up the
 * status-bar padding when the banner was visible; the same wrapper is
 * still useful when any future component needs to override the top
 * inset for its subtree.
 *
 * API mirrors the original: optional `edges` (array form) controls which
 * sides receive their respective inset; omitting `edges` applies all four.
 */
import { View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Edge = 'top' | 'right' | 'bottom' | 'left';

export interface SafeAreaViewProps extends ViewProps {
  edges?: readonly Edge[];
}

export function SafeAreaView({ edges, style, ...rest }: SafeAreaViewProps) {
  const insets = useSafeAreaInsets();
  const apply = (edge: Edge) => (edges == null ? true : edges.includes(edge));

  return (
    <View
      {...rest}
      style={[
        {
          paddingTop: apply('top') ? insets.top : 0,
          paddingBottom: apply('bottom') ? insets.bottom : 0,
          paddingLeft: apply('left') ? insets.left : 0,
          paddingRight: apply('right') ? insets.right : 0,
        },
        style,
      ]}
    />
  );
}
