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
  const RefreshControl = makeRNComponent('RefreshControl');

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

  const useWindowDimensions = () => ({
    width: 390,
    height: 844,
    scale: 3,
    fontScale: 1,
  });

  const Keyboard = {
    dismiss: () => undefined,
    addListener: () => ({ remove: () => undefined }),
  };

  const BackHandler = {
    addEventListener: () => ({ remove: () => undefined }),
    removeEventListener: () => undefined,
    exitApp: () => undefined,
  };

  const ToastAndroid = {
    SHORT: 0,
    LONG: 1,
    show: () => undefined,
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
    RefreshControl,
    Platform,
    StyleSheet,
    Dimensions,
    useWindowDimensions,
    Keyboard,
    BackHandler,
    ToastAndroid,
  };
});

// `lucide-react-native` ships ESM that re-exports icons backed by
// `react-native-svg`. Render each icon as a stub host element so
// snapshots show its name + size/color props.
//
// IMPORTANT: Vite SSR / vitest probe the mock with meta keys
// (`__esModule`, `default`, `then`, Symbol.toPrimitive, etc.). A naive
// Proxy returning a component for ANY key — including `then` — looks
// like a thenable and Vite's interop awaits it forever. We filter
// symbols + known interop keys, and implement `has` / `ownKeys` so
// vitest's named-export validation accepts every icon name.
vi.mock('lucide-react-native', () => {
  const META_KEYS = new Set([
    '__esModule',
    'default',
    'then',
    'toJSON',
    'toString',
    'valueOf',
    'constructor',
    'prototype',
  ]);
  const cache = new Map<string, unknown>();
  const target: Record<string, unknown> = { __esModule: true };
  return new Proxy(target, {
    has: (_t, name) => typeof name === 'string' && !META_KEYS.has(name),
    get: (_t, name) => {
      if (typeof name === 'symbol') return undefined;
      if (name === '__esModule') return true;
      if (META_KEYS.has(name)) return undefined;
      const cached = cache.get(name);
      if (cached) return cached;
      const Component = (props: AnyProps) =>
        React.createElement(`lucide-${String(name)}`, props, null);
      Component.displayName = `lucide.${String(name)}`;
      cache.set(name, Component);
      return Component;
    },
  });
});

// `expo-router` hooks (useRouter / usePathname / Redirect / Stack).
// Tests that need different routing behaviour override per-test.
const routerStub = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  navigate: vi.fn(),
  canGoBack: () => false,
  setParams: vi.fn(),
  dismiss: vi.fn(),
  dismissAll: vi.fn(),
  dismissTo: vi.fn(),
};

vi.mock('expo-router', () => {
  const Redirect = (props: AnyProps) =>
    React.createElement('rn-Redirect', { href: props.href }, null);
  const StackComponent = (props: AnyProps) =>
    React.createElement('rn-Stack', props, props.children);
  // Stack has subcomponents (Stack.Screen) in expo-router — expose as
  // function-component children so JSX accepts them in tests.
  const Stack = Object.assign(StackComponent, {
    Screen: (props: AnyProps) => React.createElement('rn-Stack.Screen', props, null),
  });
  const Tabs = Object.assign(
    (props: AnyProps) => React.createElement('rn-Tabs', props, props.children),
    {
      Screen: (props: AnyProps) => React.createElement('rn-Tabs.Screen', props, null),
    },
  );
  return {
    Redirect,
    Stack,
    Tabs,
    Link: (props: AnyProps) => React.createElement('rn-Link', props, props.children),
    useRouter: () => routerStub,
    useNavigation: () => routerStub,
    usePathname: () => '/',
    useLocalSearchParams: () => ({}),
    useSegments: () => [] as string[],
    useFocusEffect: (_cb: () => void) => undefined,
    router: routerStub,
  };
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
    // Entering / exiting presets — components chain methods like
    // `FadeIn.duration(250).delay(100)`. Return a self-referential
    // Proxy so any method call returns the same object.
    FadeIn: createAnimationPresetMock(),
    FadeOut: createAnimationPresetMock(),
    FadeInDown: createAnimationPresetMock(),
    FadeInUp: createAnimationPresetMock(),
    SlideInRight: createAnimationPresetMock(),
    SlideOutRight: createAnimationPresetMock(),
  };
});

function createAnimationPresetMock(): unknown {
  const handler: ProxyHandler<object> = {
    get(_target, _prop) {
      return () => proxy;
    },
  };
  const proxy: object = new Proxy({}, handler);
  return proxy;
}

// `react-native-safe-area-context` reads native insets. Stub
// `useSafeAreaInsets` with typical iPhone insets for snapshot
// stability.
vi.mock('react-native-safe-area-context', () => {
  return {
    useSafeAreaInsets: () => ({
      top: 44,
      bottom: 34,
      left: 0,
      right: 0,
    }),
    SafeAreaProvider: (props: AnyProps) =>
      React.createElement('rn-SafeAreaProvider', props, props.children),
    SafeAreaView: makeRNComponent('SafeAreaView'),
    SafeAreaInsetsContext: {
      Provider: (props: AnyProps) =>
        React.createElement('rn-SafeAreaInsetsContext.Provider', props, props.children),
    },
  };
});

// `@react-native-async-storage/async-storage` — in-memory map mock above.
vi.mock('expo-clipboard', () => ({
  setStringAsync: vi.fn(async () => true),
  getStringAsync: vi.fn(async () => ''),
}));

// Default AsyncStorage mock — in-memory map. Tests that need to assert
// on storage state can re-mock per-file with their own backing Map
// (see lib/auth/storage.test.ts, lib/api/base-url.test.ts).
// on storage state can re-mock per-file with their own backing Map
// (see lib/auth/storage.test.ts, lib/api/base-url.test.ts).
vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => mem.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        mem.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        mem.delete(key);
      }),
      clear: vi.fn(async () => {
        mem.clear();
      }),
    },
  };
});

// `react-native-gesture-handler` ships native bindings. Provide a JS-only
// stub that captures the configured handler callbacks on a `__cfg`
// property so tests can simulate pinch / tap by calling
// `(detector.props.gesture as any).__cfg.onUpdate({ scale: 1.4 })`.
vi.mock('react-native-gesture-handler', () => {
  type AnyFn = (...args: unknown[]) => unknown;
  interface GestureCfg {
    kind: string;
    onStart?: AnyFn;
    onUpdate?: AnyFn;
    onEnd?: AnyFn;
    children?: unknown[];
  }
  function builder(kind: string) {
    const cfg: GestureCfg = { kind };
    const chain = {
      onStart(fn: AnyFn) {
        cfg.onStart = fn;
        return chain;
      },
      onUpdate(fn: AnyFn) {
        cfg.onUpdate = fn;
        return chain;
      },
      onEnd(fn: AnyFn) {
        cfg.onEnd = fn;
        return chain;
      },
      __cfg: cfg,
    };
    return chain;
  }
  const Gesture = {
    Pinch: () => builder('pinch'),
    Tap: () => builder('tap'),
    Pan: () => builder('pan'),
    Simultaneous: (...children: unknown[]) => ({
      __cfg: { kind: 'simultaneous', children },
    }),
    Race: (...children: unknown[]) => ({
      __cfg: { kind: 'race', children },
    }),
  };
  const GestureDetector = (props: AnyProps) =>
    React.createElement('rn-GestureDetector', props, props.children);
  const GestureHandlerRootView = (props: AnyProps) =>
    React.createElement('rn-GestureHandlerRootView', props, props.children);
  return {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
  };
});

// `expo-media-library` ships native bindings. Default stub: granted +
// no-op save. Tests can re-mock per-file to assert call counts.
vi.mock('expo-media-library', () => ({
  requestPermissionsAsync: vi.fn(async () => ({
    granted: true,
    canAskAgain: true,
    status: 'granted',
    accessPrivileges: 'all',
  })),
  getPermissionsAsync: vi.fn(async () => ({
    granted: true,
    canAskAgain: true,
    status: 'granted',
    accessPrivileges: 'all',
  })),
  saveToLibraryAsync: vi.fn(async () => undefined),
  PermissionStatus: {
    UNDETERMINED: 'undetermined',
    GRANTED: 'granted',
    DENIED: 'denied',
  },
}));
