// jsdom global window is provided by vitest's `environment: 'jsdom'`.
// react-native-web reads `window` at import time, so we don't need a
// custom setup beyond ensuring the testing-library renderer is loaded
// lazily inside each test.
//
// Intentionally empty for now — kept so vitest.config can reference a
// stable path and future setup (theme, fonts) drops in here.
export {};
