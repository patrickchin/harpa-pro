/**
 * Usage screen body tests.
 *
 * Covers the visible states + interactions the canonical
 * `app/usage.tsx` exercises:
 *  - loading state renders a spinner (no list / pricing card)
 *  - empty state renders the "No usage data yet" notice
 *  - populated history renders the all-time summary + monthly rows
 *  - tapping a month row expands its details; tapping again collapses
 *  - tapping a different month switches expansion (only one open)
 *  - the chart slot only renders when ≥ 2 months AND `chart` is non-null
 *  - back button invokes onBack
 *  - snapshot of the populated layout
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { Usage, type UsageMonthlyRow } from './usage';

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

const HISTORY: ReadonlyArray<UsageMonthlyRow> = [
  { month: '2024-11', reportsCount: 12, voiceNotesCount: 34 },
  { month: '2024-10', reportsCount: 8, voiceNotesCount: 21 },
  { month: '2024-09', reportsCount: 15, voiceNotesCount: 40 },
];

const TOTALS = { reports: 35, voiceNotes: 95 };

const defaults = {
  history: HISTORY,
  totals: TOTALS,
  isLoading: false,
  refreshing: false,
  onRefresh: vi.fn(),
  onBack: vi.fn(),
};

describe('Usage', () => {
  it('renders loading spinner when isLoading', () => {
    const tree = render(<Usage {...defaults} isLoading history={null} />);
    expect(() =>
      tree.root.findByProps({ testID: 'usage-loading' }),
    ).not.toThrow();
    expect(collectText(tree.toJSON())).not.toContain('All-Time Summary');
  });

  it('renders empty notice when history is empty array', () => {
    const tree = render(
      <Usage {...defaults} history={[]} totals={{ reports: 0, voiceNotes: 0 }} />,
    );
    expect(() =>
      tree.root.findByProps({ testID: 'usage-empty' }),
    ).not.toThrow();
    expect(collectText(tree.toJSON())).toContain('No usage data yet');
  });

  it('renders all-time summary + monthly rows when populated', () => {
    const tree = render(<Usage {...defaults} />);
    const text = collectText(tree.toJSON());
    expect(text).toContain('All-Time Summary');
    expect(text).toContain('Monthly Breakdown');
    expect(text).toContain('November 2024');
    expect(text).toContain('October 2024');
    expect(text).toContain('September 2024');
    // Totals (35) and pricing reference both visible.
    expect(text).toContain('35');
    expect(text).toContain('Token Pricing Reference');
  });

  it('expands a month row on press and shows its details', () => {
    const tree = render(<Usage {...defaults} />);
    act(() =>
      tree.root.findByProps({ testID: 'usage-month-2024-11' }).props.onPress(),
    );
    const text = collectText(tree.toJSON());
    // The row's stat tiles (Reports + Voice Notes) only render when
    // expanded; checking for the row-specific value is brittle, so we
    // confirm the accessibility label flipped to "collapse".
    const pressable = tree.root.findByProps({
      testID: 'usage-month-2024-11',
    });
    expect(pressable.props.accessibilityLabel).toContain('collapse');
    expect(text).toContain('November 2024');
  });

  it('collapses an expanded row when pressed again', () => {
    const tree = render(<Usage {...defaults} />);
    const findRow = () =>
      tree.root.findByProps({ testID: 'usage-month-2024-11' });
    act(() => findRow().props.onPress());
    expect(findRow().props.accessibilityLabel).toContain('collapse');
    act(() => findRow().props.onPress());
    expect(findRow().props.accessibilityLabel).toContain('expand');
  });

  it('switches expansion when a different month is pressed', () => {
    const tree = render(<Usage {...defaults} />);
    act(() =>
      tree.root.findByProps({ testID: 'usage-month-2024-11' }).props.onPress(),
    );
    act(() =>
      tree.root.findByProps({ testID: 'usage-month-2024-10' }).props.onPress(),
    );
    expect(
      tree.root.findByProps({ testID: 'usage-month-2024-11' }).props
        .accessibilityLabel,
    ).toContain('expand');
    expect(
      tree.root.findByProps({ testID: 'usage-month-2024-10' }).props
        .accessibilityLabel,
    ).toContain('collapse');
  });

  it('renders a token UsageBarChart when ≥2 months have token data', () => {
    const tree = render(
      <Usage
        {...defaults}
        history={[
          { month: '2024-11', reportsCount: 12, voiceNotesCount: 34, inputTokens: 100_000, outputTokens: 40_000 },
          { month: '2024-10', reportsCount: 8, voiceNotesCount: 21, inputTokens: 80_000, outputTokens: 30_000 },
        ]}
      />,
    );
    expect(() =>
      tree.root.findByProps({ testID: 'usage-token-chart' }),
    ).not.toThrow();
    expect(collectText(tree.toJSON())).toContain('Usage Over Time');
  });

  it('hides the token chart when token data is missing', () => {
    const tree = render(<Usage {...defaults} />);
    expect(
      tree.root.findAllByProps({ testID: 'usage-token-chart' }),
    ).toHaveLength(0);
  });

  it('hides the token chart when only one month is available', () => {
    const tree = render(
      <Usage
        {...defaults}
        history={[
          { month: '2024-11', reportsCount: 12, voiceNotesCount: 34, inputTokens: 100_000, outputTokens: 40_000 },
        ]}
      />,
    );
    expect(
      tree.root.findAllByProps({ testID: 'usage-token-chart' }),
    ).toHaveLength(0);
  });

  it('renders per-model breakdown inside the expanded row when present', () => {
    const tree = render(
      <Usage
        {...defaults}
        history={[
          {
            month: '2024-11',
            reportsCount: 12,
            voiceNotesCount: 34,
            inputTokens: 100_000,
            outputTokens: 40_000,
            perModel: [
              { model: 'gpt-4o', inputTokens: 60_000, outputTokens: 20_000 },
              { model: 'claude-sonnet', inputTokens: 40_000, outputTokens: 20_000 },
            ],
          },
        ]}
      />,
    );
    act(() =>
      tree.root.findByProps({ testID: 'usage-month-2024-11' }).props.onPress(),
    );
    expect(() =>
      tree.root.findByProps({ testID: 'usage-month-2024-11-per-model' }),
    ).not.toThrow();
    const text = collectText(tree.toJSON());
    expect(text).toContain('gpt-4o');
    expect(text).toContain('claude-sonnet');
  });

  it('invokes onBack when the back button is pressed', () => {
    const onBack = vi.fn();
    const tree = render(<Usage {...defaults} onBack={onBack} />);
    act(() =>
      tree.root.findByProps({ testID: 'btn-back' }).props.onPress(),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('matches snapshot at default props', () => {
    const tree = render(<Usage {...defaults} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
