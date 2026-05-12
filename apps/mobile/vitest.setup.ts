/**
 * Vitest setup — stubs for native modules so primitives can be
 * snapshot-tested in node-only Vitest without dragging in the real
 * native bindings.
 *
 * `react-native`'s real entry imports source files containing Flow
 * syntax (`typeof` as a Flow type) which esbuild + Vite's SSR parser
 * cannot read. Rather than wire babel + babel-preset-flow into every
 * test run, we stub `react-native` itself: each component becomes a
 * tiny React component that renders a stable host type name
 * (`'rn-View'`, `'rn-Pressable'`, …). react-test-renderer's `toJSON()`
 * then produces a clean, snapshot-stable tree without pulling
 * Platform / Yoga / Fabric bindings.
 *
 * Memory note `react19-testing.md`:
 *   - Wrap react-test-renderer `create()` in synchronous `act()` for
 *     components with useEffect/useState.
 *   - Never set `globalThis.IS_REACT_ACT_ENVIRONMENT = true` — it
 *     causes Vitest teardown failures.
 *   - Synchronous `act(() => { tree = create(...) })` only.
 */
import React from 'react';
import { vi } from 'vitest';

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

function makeRNComponent(name: string) {
  const Component = (props: AnyProps) =>
    React.createElement(`rn-${name}`, props, props.children);
  Component.displayName = `RN.${name}`;
  return Component;
}

vi.mock('react-native', () => {
  const View = makeRNComponent('View');
  const Text = makeRNComponent('Text');
  const Pressable = makeRNComponent('Pressable');
  const TextInput = makeRNComponent('TextInput');
  const ScrollView = makeRNComponent('ScrollView');
  const Modal = makeRNComponent('Modal');
  const Image = makeRNComponent('Image');
  const SafeAreaView = makeRNComponent('SafeAreaView');
  const ActivityIndicator = makeRNComponent('ActivityIndicator');
  const KeyboardAvoidingView = makeRNComponent('KeyboardAvoidingView');
  const TouchableOpacity = makeRNComponent('TouchableOpacity');
  const TouchableHighlight = makeRNComponent('TouchableHighlight');
  const FlatList = makeRNComponent('FlatList');
  const SectionList = makeRNComponent('SectionList');

  const Platform = {
    OS: 'ios',
    select: <T,>(spec: { ios?: T; android?: T; default?: T }) =>
      spec.ios ?? spec.default,
  };

  const StyleSheet = {
    create: <T extends Record<string, object>>(styles: T) => styles,
    flatten: (style: unknown) => style,
    hairlineWidth: 1,
    absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
    absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  };

  const Dimensions = {
    get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
    addEventListener: () => ({ remove: () => undefined }),
  };

  const Keyboard = {
    dismiss: () => undefined,
    addListener: () => ({ remove: () => undefined }),
  };

  return {
    View,
    Text,
    Pressable,
    TextInput,
    ScrollView,
    Modal,
    Image,
    SafeAreaView,
    ActivityIndicator,
    KeyboardAvoidingView,
    TouchableOpacity,
    TouchableHighlight,
    FlatList,
    SectionList,
    Platform,
    StyleSheet,
    Dimensions,
    Keyboard,
  };
});

// `lucide-react-native` ships ESM that re-exports icons backed by
// `react-native-svg`. Render each icon as a stub host element so
// snapshots show its name + size/color props.
vi.mock('lucide-react-native', () => {
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === '__esModule') return true;
        const Component = (props: AnyProps) =>
          React.createElement(`lucide-${String(name)}`, props, null);
        Component.displayName = `lucide.${String(name)}`;
        return Component;
      },
    },
  );
});

// `react-native-reanimated` binds natives. Provide just the surface
// area primitives consume.
vi.mock('react-native-reanimated', async () => {
  const ReactNative = await import('react-native');
  const View = ReactNative.View;
  return {
    default: { View, ScrollView: ReactNative.ScrollView, Text: ReactNative.Text },
    View,
    ScrollView: ReactNative.ScrollView,
    Text: ReactNative.Text,
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: (worklet: () => Record<string, unknown>) => worklet(),
    useDerivedValue: (worklet: () => unknown) => ({ value: worklet() }),
    withTiming: (toValue: unknown) => toValue,
    withRepeat: (animation: unknown) => animation,
    withSpring: (toValue: unknown) => toValue,
    withDelay: (_delay: number, animation: unknown) => animation,
    cancelAnimation: () => undefined,
    interpolate: (_value: number, _inputRange: number[], outputRange: number[]) =>
      outputRange[0] ?? 0,
    Easing: new Proxy(
      {},
      {
        get: () => () => 0,
      },
    ),
  };
});
