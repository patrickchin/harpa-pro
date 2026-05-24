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
import { View } from 'react-native';

import { Usage, type UsageMonthlyRow, type RecentUsageEvent } from './usage';

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

  it('renders the chart slot when chart is set and history has > 1 month', () => {
    const tree = render(
      <Usage
        {...defaults}
        chart={<View testID="dev-chart" />}
      />,
    );
    expect(() =>
      tree.root.findByProps({ testID: 'dev-chart' }),
    ).not.toThrow();
    expect(collectText(tree.toJSON())).toContain('Usage Over Time');
  });

  it('hides the chart slot when only one month is available', () => {
    const tree = render(
      <Usage
        {...defaults}
        history={HISTORY.slice(0, 1)}
        chart={<View testID="dev-chart" />}
      />,
    );
    expect(
      tree.root.findAllByProps({ testID: 'dev-chart' }),
    ).toHaveLength(0);
  });

  it('invokes onBack when the back button is pressed', () => {
    const onBack = vi.fn();
    const tree = render(<Usage {...defaults} onBack={onBack} />);
    act(() =>
      tree.root.findByProps({ testID: 'btn-back' }).props.onPress(),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders Recent Activity card when recentEvents is non-empty', () => {
    const events: ReadonlyArray<RecentUsageEvent> = [
      {
        id: 'lue_chat',
        createdAt: '2024-11-15T10:00:00.000Z',
        vendor: 'openai',
        model: 'gpt-4o-mini',
        operation: 'chat',
        inputTokens: 200,
        outputTokens: 50,
        cachedTokens: 10,
        inputSeconds: null,
        status: 'ok',
      },
      {
        id: 'lue_transcribe',
        createdAt: '2024-11-15T09:00:00.000Z',
        vendor: 'openai',
        model: 'whisper-1',
        operation: 'transcribe',
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        inputSeconds: 42,
        status: 'ok',
      },
      {
        id: 'lue_error',
        createdAt: '2024-11-15T08:00:00.000Z',
        vendor: 'kimi',
        model: 'moonshot-v1-8k',
        operation: 'chat',
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        inputSeconds: null,
        status: 'error',
      },
    ];
    const tree = render(<Usage {...defaults} recentEvents={events} />);
    expect(() =>
      tree.root.findByProps({ testID: 'usage-recent-events' }),
    ).not.toThrow();
    const text = collectText(tree.toJSON());
    expect(text).toContain('Recent Activity');
    expect(text).toContain('gpt-4o-mini');
    expect(text).toContain('whisper-1');
    expect(text).toContain('moonshot-v1-8k');
    // Chat row totals input+output tokens (200 + 50 = 250).
    expect(text).toContain('250');
    // Transcribe row shows formatted seconds, not tokens.
    expect(text).toContain('42s');
    // Error row flagged in subtitle.
    expect(text).toContain('failed');
  });

  it('hides Recent Activity card when recentEvents is empty', () => {
    const tree = render(<Usage {...defaults} recentEvents={[]} />);
    expect(
      tree.root.findAllByProps({ testID: 'usage-recent-events' }),
    ).toHaveLength(0);
    expect(collectText(tree.toJSON())).not.toContain('Recent Activity');
  });

  it('matches snapshot at default props', () => {
    const tree = render(<Usage {...defaults} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
