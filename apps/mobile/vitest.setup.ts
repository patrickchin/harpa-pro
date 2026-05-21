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
import { expect, vi } from 'vitest';

// Default voice tests to the fixture recorder backend so
// `pickRecorderFactory()` never tries to `require('./expoAudioRecorder')`
// at runtime (Vite SSR can't resolve relative requires from ESM).
// `features/voice/fixtureRecorder.test.ts` overrides this per-case via
// `__resetPickedRecorderForTests` and direct env mutation.
// vitest.setup.ts is an allow-listed reader of EXPO_PUBLIC_* in
// `.eslintrc.cjs` — it must mutate the env before the recorder
// factory imports it, so it precedes `lib/env.ts`.
process.env.EXPO_PUBLIC_USE_FIXTURES = 'true';

// React 19 changed the element brand from `Symbol.for('react.element')`
// to `Symbol.for('react.transitional.element')`. `@vitest/pretty-format`
// ships a `ReactElement` plugin keyed on the OLD symbol, so React 19
// elements that appear as props (e.g. `<ScrollView refreshControl={…}>`)
// no longer match it and fall through to the generic object printer.
// The DEV-only `_owner` field on each element points back into the
// FiberNode, so generic printing recurses through the whole fiber tree
// and explodes with `Invalid string length`.
//
// Workaround until @vitest/pretty-format learns the transitional brand:
// register a snapshot serializer that re-brands a React 19 element as
// the classic `react.element` shape and strips `_owner` / `_store`.
// The downstream `ReactElement` plugin then prints it as
// `<TypeName prop=…>children</TypeName>` like it always did.
const REACT_19_ELEMENT = Symbol.for('react.transitional.element');
const REACT_18_ELEMENT = Symbol.for('react.element');
expect.addSnapshotSerializer({
  test(val: unknown): val is { $$typeof: symbol; type: unknown; props: unknown; key: unknown } {
    return (
      typeof val === 'object' &&
      val !== null &&
      (val as { $$typeof?: symbol }).$$typeof === REACT_19_ELEMENT
    );
  },
  serialize(val, config, indentation, depth, refs, printer) {
    const shim = {
      $$typeof: REACT_18_ELEMENT,
      type: (val as { type: unknown }).type,
      props: (val as { props: unknown }).props,
      key: (val as { key: unknown }).key,
      ref: null,
    };
    return printer(shim, config, indentation, depth, refs);
  },
});

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

// `expo-asset` ships native bindings (depends on `expo-modules-core`
// which reads `globalThis.expo.EventEmitter` at module load — a value
// only set inside the RN runtime). The fixture-mode recorder imports
// `Asset.loadAsync` to fetch the canned voice-sample, so any test that
// transitively imports `useInlineRecorder` would crash on load. Stub
// it with a `loadAsync` that returns a single bundled-asset record.
vi.mock('expo-asset', () => ({
  Asset: {
    loadAsync: vi.fn(async (mod: unknown) => [
      { localUri: 'file:///fixtures/voice-sample.m4a', uri: 'file:///fixtures/voice-sample.m4a', mod },
    ]),
    fromModule: (mod: unknown) => ({
      localUri: 'file:///fixtures/voice-sample.m4a',
      uri: 'file:///fixtures/voice-sample.m4a',
      mod,
      downloadAsync: vi.fn(async () => undefined),
    }),
  },
}));

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

// `react-native-svg` ships native bindings; render each export as a
// stub host element so snapshots stay stable.
vi.mock('react-native-svg', () => {
  const NAMES = [
    'Svg',
    'Rect',
    'Line',
    'Circle',
    'Path',
    'G',
    'Text',
    'TSpan',
    'Defs',
    'LinearGradient',
    'Stop',
    'ClipPath',
    'Polygon',
    'Polyline',
    'Ellipse',
  ];
  const out: Record<string, unknown> = { __esModule: true };
  for (const name of NAMES) {
    out[name] = makeRNComponent(`svg-${name}`);
  }
  out.default = out.Svg;
  return out;
});

// `expo-image` — render as a stub host so component trees that consume
// CachedImage are inspectable in tests.
vi.mock('expo-image', () => ({
  Image: makeRNComponent('expo-Image'),
}));

// `expo-image-picker` — default mock returns a single picked asset.
// Tests that need cancel / permission-denied paths can re-mock per file.
vi.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: vi.fn(async () => ({
    granted: true,
    canAskAgain: true,
    status: 'granted',
  })),
  launchImageLibraryAsync: vi.fn(async () => ({
    canceled: false,
    assets: [
      {
        uri: 'file:///tmp/picked-avatar.jpg',
        width: 1024,
        height: 1024,
        type: 'image',
        mimeType: 'image/jpeg',
        fileSize: 128_000,
      },
    ],
  })),
  PermissionStatus: {
    UNDETERMINED: 'undetermined',
    GRANTED: 'granted',
    DENIED: 'denied',
  },
  MediaType: { Images: 'images' },
  MediaTypeOptions: { Images: 'Images' },
}));

// `expo-image-manipulator` — pass through the input URI as the
// "compressed" output so tests can assert downstream behaviour without
// faking pixels.
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: vi.fn(async (uri: string) => ({
    uri,
    width: 512,
    height: 512,
  })),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

// `expo-file-system` ships native bindings via `expo-modules-core`.
// We stub the v55 modern `File` class API used by the app for size
// lookup (avatar upload, camera upload) and cleanup (camera capture).
vi.mock('expo-file-system', () => {
  class File {
    uri: string;
    size = 80_000;
    exists = true;
    constructor(uri: string) {
      this.uri = uri;
    }
    delete() {
      // no-op
    }
  }
  return {
    File,
    Directory: class {},
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
