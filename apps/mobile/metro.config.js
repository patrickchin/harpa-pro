const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const exclusionList =
  require('metro-config/private/defaults/exclusionList').default;

const config = getDefaultConfig(__dirname);

// Exclude Vitest test files from Metro bundling. Expo Router's
// require.context scans every file under `app/` and does not filter
// out `.test.*` / `.spec.*`, which drags `vitest` into the native
// bundle and breaks the simulator build with
// "Unable to resolve @vitest/runner/utils from node_modules/vitest".
config.resolver.blockList = exclusionList([
  /.*\.test\.(?:js|jsx|ts|tsx)$/,
  /.*\.spec\.(?:js|jsx|ts|tsx)$/,
  /.*\/__tests__\/.*/,
]);

// `@harpa/api-contract` (and other workspace packages) use ESM-style
// imports with explicit `.js` extensions that resolve to `.ts` source
// files at build time (tsconfig moduleResolution: "Bundler"). Metro's
// default resolver does not strip `.js` to find a `.ts` sibling, so
// any value-import from `@harpa/api-contract` blew up the bundler with
// "Unable to resolve module ./schemas/index.js" during EAS builds.
// This shim re-tries the resolution with the extension stripped before
// giving up. Type-only imports are erased so they were unaffected,
// which is why this only surfaced once we added a runtime `AI_MODELS`
// import. See docs/bugs/2026-05-29-mobile-model-picker-dead-wired.md.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('.js')) {
    try {
      return context.resolveRequest(
        context,
        moduleName.replace(/\.js$/, ''),
        platform,
      );
    } catch {
      // fall through to the default resolver
    }
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
