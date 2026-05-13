/**
 * SentryStub tests — assert initSentry is no-op, provider renders.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import React from 'react';
import { Text } from 'react-native';
import { SentryProvider, initSentry } from './SentryStub';

let tree: ReactTestRenderer | null = null;

describe('lib/telemetry/SentryStub', () => {
  afterEach(() => {
    if (tree) {
      act(() => {
        tree!.unmount();
      });
      tree = null;
    }
  });

  it('renders children without crashing', () => {
    act(() => {
      tree = create(
        <SentryProvider>
          <Text>Child</Text>
        </SentryProvider>,
      );
    });
    expect(tree!.toJSON()).toMatchSnapshot();
  });

  it('initSentry() is a no-op', () => {
    expect(() => initSentry()).not.toThrow();
  });
});
