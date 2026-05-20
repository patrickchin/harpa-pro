/**
 * Account screen body tests.
 *
 * Covers the visible states + interactions the canonical
 * `app/account.tsx` exercises:
 *  - skeleton when profile is null (loading)
 *  - read-only form with phone / full name / company filled
 *  - empty strings rendered for null fullName / companyName
 *  - default avatar placeholder when no slot is passed
 *  - custom avatar slot rendered when provided
 *  - back button invokes onBack
 *  - snapshot of the loaded layout
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { View } from 'react-native';

import { Account, type AccountProfile } from './account';

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

const baseProfile: AccountProfile = {
  phone: '+15551234567',
  fullName: 'Jordan Sims',
  companyName: 'Sims Construction',
};

const defaults = {
  profile: baseProfile,
  refreshing: false,
  onRefresh: vi.fn(),
  onBack: vi.fn(),
};

describe('Account', () => {
  it('renders skeleton when profile is null', () => {
    const tree = render(<Account {...defaults} profile={null} />);
    expect(() =>
      tree.root.findByProps({ testID: 'screen-account-loading' }),
    ).not.toThrow();
    expect(collectText(tree.toJSON())).not.toContain('Jordan Sims');
  });

  it('renders phone / full name / company when loaded', () => {
    const tree = render(<Account {...defaults} />);
    const text = collectText(tree.toJSON());
    expect(text).toContain('Account Details');
    expect(text).toContain('Phone');
    expect(text).toContain('Full Name');
    expect(text).toContain('Company Name');
    // Input values live in TextInput `value` props, not children:
    const inputs = tree.root.findAllByType('rn-TextInput' as any);
    const values = inputs.map((i) => i.props.value);
    expect(values).toContain('+15551234567');
    expect(values).toContain('Jordan Sims');
    expect(values).toContain('Sims Construction');
  });

  it('renders empty string for null fullName / companyName', () => {
    const tree = render(
      <Account
        {...defaults}
        profile={{ ...baseProfile, fullName: null, companyName: null }}
      />,
    );
    const inputs = tree.root.findAllByType('rn-TextInput' as any);
    const values = inputs.map((i) => i.props.value);
    expect(values).toContain('+15551234567');
    // null fullName / companyName surface as '' in the field.
    expect(values.filter((v) => v === '').length).toBeGreaterThanOrEqual(2);
  });

  it('renders the default avatar placeholder when no slot is passed', () => {
    const tree = render(<Account {...defaults} />);
    expect(() =>
      tree.root.findByProps({ testID: 'account-avatar-placeholder' }),
    ).not.toThrow();
  });

  it('renders a custom avatar slot when provided', () => {
    const tree = render(
      <Account
        {...defaults}
        avatarSlot={<View testID="custom-avatar" />}
      />,
    );
    expect(() =>
      tree.root.findByProps({ testID: 'custom-avatar' }),
    ).not.toThrow();
    // Default placeholder must not also render.
    expect(
      tree.root.findAllByProps({ testID: 'account-avatar-placeholder' }),
    ).toHaveLength(0);
  });

  it('invokes onBack when the back button is pressed', () => {
    const onBack = vi.fn();
    const tree = render(<Account {...defaults} onBack={onBack} />);
    act(() =>
      tree.root.findByProps({ testID: 'btn-back' }).props.onPress(),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('matches snapshot at default props', () => {
    const tree = render(<Account {...defaults} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
