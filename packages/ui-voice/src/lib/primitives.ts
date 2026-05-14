/**
 * Cross-platform RN primitives with NativeWind `className` support.
 *
 * On native (Metro), NativeWind's Babel preset compiles `className`
 * into styles automatically. On web (Astro / Vite via
 * `react-native-web`), RNW's `View`/`Text` strip the `className`
 * prop — so we wrap them here in a small higher-order component
 * that converts `className="foo bar"` into the
 * `style={{ $$css: true, 'foo bar': 'foo bar' }}` marker that RNW
 * recognises and copies onto the DOM element. This is the same
 * mechanism `react-native-css-interop` uses on web, inlined to
 * avoid pulling in the package's `doctor.js` (JSX-in-`.js` literal
 * breaks esbuild) and its Flow-typed transitive deps that confuse
 * Vitest.
 */
import { createElement } from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  Platform,
  View as RNView,
  Text as RNText,
  Pressable as RNPressable,
  ScrollView as RNScrollView,
} from 'react-native';

type WithClassName<P> = P & {
  className?: string;
  contentContainerClassName?: string;
  children?: ReactNode;
};

function makeStyle(className: string | undefined) {
  if (!className) return undefined;
  // RNW's normaliseValueWithProperty checks for `$$css === true` and
  // copies the remaining keys onto the DOM element's classList. Any
  // stable key works as long as the value is the class string.
  return { $$css: true as const, ui: className } as unknown;
}

function withClassName<P extends object>(
  Inner: ComponentType<P>,
): ComponentType<WithClassName<P>> {
  // On native, NativeWind's babel preset has already rewritten
  // `className` into `style` on JSX usages of the wrapped primitive,
  // so we just forward props as-is. On web, RNW would strip
  // `className`, so we convert it into an `$$css` style marker that
  // RNW copies onto the DOM element's `class` attribute. Using a
  // plain function component (no `forwardRef`) keeps the React
  // element `$$typeof` symbol consistent — `forwardRef` produces a
  // different element kind that can collide if multiple React
  // copies end up in the worker.
  if (Platform.OS !== 'web') {
    return Inner as unknown as ComponentType<WithClassName<P>>;
  }
  function Wrapped(props: WithClassName<P>) {
    const { className, contentContainerClassName, ...rest } = props as Record<
      string,
      unknown
    >;
    const next: Record<string, unknown> = { ...rest };
    if (typeof className === 'string' && className) {
      const wrapped = makeStyle(className);
      next['style'] = rest['style'] ? [wrapped, rest['style']] : wrapped;
    }
    if (
      typeof contentContainerClassName === 'string' &&
      contentContainerClassName
    ) {
      const wrapped = makeStyle(contentContainerClassName);
      next['contentContainerStyle'] = rest['contentContainerStyle']
        ? [wrapped, rest['contentContainerStyle']]
        : wrapped;
    }
    return createElement(Inner as ComponentType<unknown>, next);
  }
  Wrapped.displayName = `WithClassName(${Inner.displayName ?? Inner.name ?? 'Component'})`;
  return Wrapped as unknown as ComponentType<WithClassName<P>>;
}

export const View = withClassName(
  RNView as unknown as ComponentType<object>,
) as unknown as typeof RNView;
export const Text = withClassName(
  RNText as unknown as ComponentType<object>,
) as unknown as typeof RNText;
export const Pressable = withClassName(
  RNPressable as unknown as ComponentType<object>,
) as unknown as typeof RNPressable;
export const ScrollView = withClassName(
  RNScrollView as unknown as ComponentType<object>,
) as unknown as typeof RNScrollView;

// On web, react-native-web injects its base stylesheet (id
// `react-native-stylesheet`) UNLAYERED via the CSSOM
// (`sheet.insertRule`). In CSS cascade, unlayered rules WIN against
// any `@layer utilities { ... }` rules — including all of Tailwind's
// utilities. Without this fix, classes like `bg-card`/`border` reach
// the DOM but are visually overridden by RNW's defaults (transparent
// background, zero border, etc.). To restore Tailwind precedence, we
// re-insert every existing rule wrapped in `@layer rnw { ... }` and
// monkey-patch `insertRule` so future RNW insertions are layered
// too. `globals.css` declares `@layer rnw, theme, base, components,
// utilities;` so the `rnw` layer sits BELOW Tailwind's utilities.
//
// Skipped under jsdom (no `CSSLayerBlockRule`) — tests don't exercise
// the visual cascade and the rewrap would just clear RNW's stylesheet
// for no benefit.
if (
  typeof document !== 'undefined' &&
  typeof globalThis.CSSLayerBlockRule !== 'undefined'
) {
  const layerify = (el: HTMLStyleElement) => {
    if (el.dataset.layerWrapped === '1') return;
    const sheet = el.sheet;
    if (!sheet) return;
    el.dataset.layerWrapped = '1';
    const existing: string[] = [];
    for (let i = 0; i < sheet.cssRules.length; i++) {
      const rule = sheet.cssRules[i];
      if (rule) existing.push(rule.cssText);
    }
    while (sheet.cssRules.length > 0) sheet.deleteRule(0);
    for (const rule of existing) {
      try {
        sheet.insertRule(`@layer rnw { ${rule} }`, sheet.cssRules.length);
      } catch {
        // Some "stylesheet-group" rules are RNW internal markers and
        // may fail to re-parse — skipping is harmless.
      }
    }
    const originalInsert = sheet.insertRule.bind(sheet);
    sheet.insertRule = (rule: string, index?: number) => {
      const wrapped = rule.trimStart().startsWith('@layer')
        ? rule
        : `@layer rnw { ${rule} }`;
      return originalInsert(wrapped, index);
    };
  };
  const tryWrap = () => {
    const el = document.getElementById('react-native-stylesheet');
    if (el instanceof HTMLStyleElement) layerify(el);
  };
  tryWrap();
  const observer = new MutationObserver(tryWrap);
  observer.observe(document.head, { childList: true, subtree: false });
}
