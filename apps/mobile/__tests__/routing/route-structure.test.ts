/**
 * Structural route tests — no rendering, no React Native.
 * Scans the filesystem to assert that layouts and routes exist where the
 * navigator expects them. Fast (~ms) and catches missing _layout.tsx files
 * before they become runtime warnings.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const APP_DIR = path.resolve(__dirname, '../../app');

function exists(rel: string) {
  return fs.existsSync(path.join(APP_DIR, rel));
}

describe('Route structure — layout files', () => {
  it('has a Stack layout for the projects tab', () => {
    // Without this, router.replace("/(app)/projects") throws
    // "No route named projects exists in nested children"
    expect(exists('(app)/projects/_layout.tsx')).toBe(true);
  });

  it('has a layout for the (app) group', () => {
    expect(exists('(app)/_layout.tsx')).toBe(true);
  });

  it('has a layout for the (auth) group', () => {
    expect(exists('(auth)/_layout.tsx')).toBe(true);
  });
});

describe('Route structure — screen files', () => {
  const requiredRoutes = [
    '(app)/projects/index.tsx',
    '(app)/projects/new.tsx',
    '(app)/projects/[projectSlug]/index.tsx',
    '(app)/projects/[projectSlug]/edit.tsx',
    '(app)/projects/[projectSlug]/members.tsx',
    '(app)/projects/[projectSlug]/reports/index.tsx',
    '(app)/projects/[projectSlug]/reports/[number]/generate.tsx',
  ];

  for (const route of requiredRoutes) {
    it(`has route: ${route}`, () => {
      expect(exists(route)).toBe(true);
    });
  }
});
