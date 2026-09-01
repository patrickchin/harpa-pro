import { describe, expect, it } from 'vitest';

import { shouldShowDeveloperTools } from './developer-tools';

describe('shouldShowDeveloperTools', () => {
  it.each([
    { useFixtures: false, isDevelopmentBuild: false, expected: false },
    { useFixtures: true, isDevelopmentBuild: false, expected: true },
    { useFixtures: false, isDevelopmentBuild: true, expected: true },
    { useFixtures: true, isDevelopmentBuild: true, expected: true },
  ])(
    'returns $expected for fixtures=$useFixtures and dev=$isDevelopmentBuild',
    ({ useFixtures, isDevelopmentBuild, expected }) => {
      expect(
        shouldShowDeveloperTools(useFixtures, isDevelopmentBuild),
      ).toBe(expected);
    },
  );
});
