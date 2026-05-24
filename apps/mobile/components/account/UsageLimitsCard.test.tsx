/**
 * UsageLimitsCard tests.
 *
 * Covers the Phase 3 behaviours:
 *  - renders one row per bucket with label + used/limit
 *  - unlimited (limit=null) renders no progress bar fill
 *  - ≥80%-used bar uses the danger tint testID stays the same
 *  - overridden bucket surfaces the "Custom limit set by support" hint
 *  - plan badge label tracks the plan prop
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { UsageLimitsCard, type LimitBucket } from './UsageLimitsCard';

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

const BUCKETS: ReadonlyArray<LimitBucket> = [
  {
    kind: 'report_generate',
    limit: 5,
    used: 2,
    remaining: 3,
    resetAt: '2026-07-01T00:00:00.000Z',
    plan: 'free',
    overridden: false,
  },
  {
    kind: 'voice_transcribe',
    limit: 30,
    used: 27,
    remaining: 3,
    resetAt: '2026-07-01T00:00:00.000Z',
    plan: 'free',
    overridden: false,
  },
  {
    kind: 'ai_input_tokens',
    limit: null,
    used: 5_000_000,
    remaining: null,
    resetAt: '2026-07-01T00:00:00.000Z',
    plan: 'enterprise',
    overridden: false,
  },
  {
    kind: 'ai_output_tokens',
    limit: 100_000,
    used: 12_345,
    remaining: 87_655,
    resetAt: '2026-07-01T00:00:00.000Z',
    plan: 'free',
    overridden: true,
  },
];

describe('UsageLimitsCard', () => {
  it('renders a row for each bucket with the right label and counts', () => {
    const tree = render(<UsageLimitsCard plan="free" buckets={BUCKETS} />);
    for (const b of BUCKETS) {
      expect(() => tree.root.findByProps({ testID: `usage-limit-${b.kind}` })).not.toThrow();
    }
    const reportRow = tree.root.findByProps({ testID: 'usage-limit-report_generate' });
    const text = collectText(reportRow.children);
    expect(text).toContain('Reports generated');
    expect(text).toContain('2 / 5');
  });

  it('omits the progress bar fill when the bucket is unlimited (limit=null)', () => {
    const tree = render(<UsageLimitsCard plan="enterprise" buckets={BUCKETS} />);
    expect(() =>
      tree.root.findByProps({ testID: 'usage-limit-bar-ai_input_tokens' }),
    ).toThrow();
    // Bounded buckets still render the bar.
    expect(() =>
      tree.root.findByProps({ testID: 'usage-limit-bar-report_generate' }),
    ).not.toThrow();
  });

  it('renders the danger tint when a bucket is at/above 80% used', () => {
    const tree = render(<UsageLimitsCard plan="free" buckets={BUCKETS} />);
    // voice_transcribe is 27/30 = 90% — bar should carry the danger class.
    const bar = tree.root.findByProps({ testID: 'usage-limit-bar-voice_transcribe' });
    expect(bar.props.className).toContain('bg-danger');
  });

  it('surfaces the "Custom limit set by support" hint when overridden', () => {
    const tree = render(<UsageLimitsCard plan="free" buckets={BUCKETS} />);
    const row = tree.root.findByProps({ testID: 'usage-limit-ai_output_tokens' });
    const text = collectText(row.children);
    expect(text).toContain('Custom limit set by support');
  });

  it('shows the plan badge', () => {
    const tree = render(<UsageLimitsCard plan="pro" buckets={BUCKETS} />);
    const badge = tree.root.findByProps({ testID: 'usage-limits-plan' });
    const text = collectText(badge.children);
    expect(text).toContain('PRO');
  });

  it('formats large numbers as k / M', () => {
    const tree = render(<UsageLimitsCard plan="enterprise" buckets={BUCKETS} />);
    const row = tree.root.findByProps({ testID: 'usage-limit-ai_input_tokens' });
    const text = collectText(row.children);
    // 5,000,000 → 5.0M
    expect(text).toContain('5.0M');
    expect(text).toContain('unlimited');
  });
});
