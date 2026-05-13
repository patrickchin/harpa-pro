const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const exclusionList = require('metro-config/src/defaults/exclusionList');

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

module.exports = withNativeWind(config, { input: './global.css' });
