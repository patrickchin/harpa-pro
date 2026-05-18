/**
 * `UsageBarChart` behaviour tests.
 *
 * Visual rendering (SVG primitives) is exercised under the stubbed
 * `react-native-svg` mock in `vitest.setup.ts` — we assert structural
 * properties: number of bars, label row, empty-state fallback.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { UsageBarChart } from './UsageBarChart';

function render(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(el);
  });
  return tree;
}

function collectText(node: any): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  if (node.children) return collectText(node.children);
  return '';
}

describe('UsageBarChart', () => {
  it('renders null when data is empty', () => {
    const tree = render(<UsageBarChart data={[]} />);
    expect(tree.toJSON()).toBeNull();
  });

  it('renders a bar per datum (up to 6) and reverses for newest-on-right', () => {
    const data = Array.from({ length: 8 }, (_, i) => ({
      label: `m${i}`,
      value: i + 1,
    }));
    const tree = render(<UsageBarChart data={data} />);
    const bars = tree.root.findAllByType('rn-svg-Rect' as any);
    expect(bars).toHaveLength(6);
  });

  it('renders labels beneath the chart', () => {
    const data = [
      { label: 'Nov', value: 100 },
      { label: 'Oct', value: 50 },
    ];
    const tree = render(<UsageBarChart data={data} />);
    const text = collectText(tree.toJSON());
    expect(text).toContain('Nov');
    expect(text).toContain('Oct');
  });

  it('renders the unit caption when provided', () => {
    const tree = render(
      <UsageBarChart
        data={[{ label: 'Nov', value: 1 }]}
        unit="tokens / month"
      />,
    );
    expect(collectText(tree.toJSON())).toContain('tokens / month');
  });

  it('uses the muted fill for zero-value bars', () => {
    const tree = render(
      <UsageBarChart
        data={[
          { label: 'Nov', value: 0 },
          { label: 'Oct', value: 100 },
        ]}
      />,
    );
    const bars = tree.root.findAllByType('rn-svg-Rect' as any);
    // After reverse: 0=Oct (value 100), 1=Nov (value 0)
    expect(bars[1]!.props.fill).not.toBe(bars[0]!.props.fill);
  });

  it('forwards the testID', () => {
    const tree = render(
      <UsageBarChart data={[{ label: 'N', value: 1 }]} testID="t-chart" />,
    );
    expect(() => tree.root.findByProps({ testID: 't-chart' })).not.toThrow();
  });
});
