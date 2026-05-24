/**
 * UsageLimitDialog tests — visibility gating + content for the 403
 * limit-hit dialog. The AppDialogSheet primitive uses RN Modal so we
 * just assert on testIDs and rendered text.
 */
import React from 'react';
import { Modal } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { UsageLimitDialog } from './UsageLimitDialog';
import type { UsageLimitDetails } from '@/lib/api/usage-limit-error';

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

const DETAILS: UsageLimitDetails = {
  kind: 'report_generate',
  limit: 5,
  used: 5,
  remaining: 0,
  resetAt: '2026-07-01T00:00:00.000Z',
  plan: 'free',
  overridden: false,
};

describe('UsageLimitDialog', () => {
  it('does not render the details slot when visible=false', () => {
    const onClose = vi.fn();
    const tree = render(
      <UsageLimitDialog visible={false} details={DETAILS} onClose={onClose} />,
    );
    // react-test-renderer always traverses Modal children regardless
    // of `visible`, so we assert on the Modal's prop instead.
    const modal = tree.root.findByType(Modal);
    expect(modal.props.visible).toBe(false);
  });

  it('renders the kind + used/limit when visible with details', () => {
    const onClose = vi.fn();
    const tree = render(
      <UsageLimitDialog visible details={DETAILS} onClose={onClose} />,
    );
    const text = collectText(tree.toJSON());
    expect(text).toContain('Monthly limit reached');
    expect(text).toContain('5 of 5');
    expect(text).toContain('report generations');
    expect(text).toContain('July 1');
    expect(text).toContain('FREE');
  });

  it('surfaces a "custom limit" hint when overridden is true', () => {
    const onClose = vi.fn();
    const tree = render(
      <UsageLimitDialog
        visible
        details={{ ...DETAILS, overridden: true, plan: 'pro' }}
        onClose={onClose}
      />,
    );
    const text = collectText(tree.toJSON());
    expect(text).toContain('PRO');
    expect(text).toContain('custom limit');
  });

  it('invokes onClose when the OK action fires', () => {
    const onClose = vi.fn();
    const tree = render(
      <UsageLimitDialog visible details={DETAILS} onClose={onClose} />,
    );
    const ok = tree.root.findByProps({ testID: 'usage-limit-dialog-ok' });
    act(() => {
      ok.props.onPress();
    });
    expect(onClose).toHaveBeenCalled();
  });
});
