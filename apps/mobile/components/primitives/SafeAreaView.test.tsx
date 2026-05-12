import { describe, expect, it } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

import { SafeAreaView } from './SafeAreaView';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('SafeAreaView', () => {
  it('renders with default edges (all four)', () => {
    const tree = render(
      <SafeAreaView>
        <Text>Safe content</Text>
      </SafeAreaView>,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders with explicit edges subset', () => {
    const tree = render(
      <SafeAreaView edges={['top', 'bottom']}>
        <Text>Top and bottom safe</Text>
      </SafeAreaView>,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders with empty edges', () => {
    const tree = render(
      <SafeAreaView edges={[]}>
        <Text>No safe area padding</Text>
      </SafeAreaView>,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('applies correct padding for default edges (all)', () => {
    const tree = render(
      <SafeAreaView>
        <Text>Test</Text>
      </SafeAreaView>,
    );
    const json = tree.toJSON() as TestRenderer.ReactTestRendererJSON;
    const style = (json.props.style ?? []) as unknown as Array<Record<string, unknown>>;
    const flat = style.flat(Infinity).filter(Boolean) as Array<Record<string, unknown>>;
    
    // Stub insets from vitest.setup.ts: top: 44, bottom: 34, left: 0, right: 0
    const padding = flat.find((s) => s && 'paddingTop' in s);
    expect(padding).toBeTruthy();
    expect(padding).toMatchObject({
      paddingTop: 44,
      paddingBottom: 34,
      paddingLeft: 0,
      paddingRight: 0,
    });
  });

  it('applies correct padding for partial edges', () => {
    const tree = render(
      <SafeAreaView edges={['top']}>
        <Text>Test</Text>
      </SafeAreaView>,
    );
    const json = tree.toJSON() as TestRenderer.ReactTestRendererJSON;
    const style = (json.props.style ?? []) as unknown as Array<Record<string, unknown>>;
    const flat = style.flat(Infinity).filter(Boolean) as Array<Record<string, unknown>>;
    
    // Only top edge should have padding; others should be 0
    const padding = flat.find((s) => s && 'paddingTop' in s);
    expect(padding).toBeTruthy();
    expect(padding).toMatchObject({
      paddingTop: 44,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
    });
  });

  it('applies zero padding when edges is empty', () => {
    const tree = render(
      <SafeAreaView edges={[]}>
        <Text>Test</Text>
      </SafeAreaView>,
    );
    const json = tree.toJSON() as TestRenderer.ReactTestRendererJSON;
    const style = (json.props.style ?? []) as unknown as Array<Record<string, unknown>>;
    const flat = style.flat(Infinity).filter(Boolean) as Array<Record<string, unknown>>;
    
    const padding = flat.find((s) => s && 'paddingTop' in s);
    expect(padding).toBeTruthy();
    expect(padding).toMatchObject({
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
    });
  });
});
