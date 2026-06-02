/**
 * Profile (settings) screen body tests.
 *
 * Covers:
 *  - displayName / phone / company fallbacks for null fields
 *  - top user card is a single link to account details
 *  - Usage This Month row pushes onPressUsage
 *  - Developer row appears only when showDeveloperSection is true and
 *    pushes onPressDeveloper
 *  - sign-out button invokes onSignOut
 *  - clear-cache button opens AppDialogSheet → confirm calls onClearCache
 *  - build badge renders
 *  - snapshot of the populated layout
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { Profile, type ProfileUser } from './profile';

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

const USER: ProfileUser = {
  displayName: 'Jordan Sims',
  companyName: 'Sims Construction',
  email: "test@example.com",
};

const defaults = {
  user: USER,
  isLoading: false,
  refreshing: false,
  onRefresh: vi.fn(),
  onBack: vi.fn(),
  onPressAccount: vi.fn(),
  onPressUsage: vi.fn(),
  onPressDeveloper: vi.fn(),
  onSignOut: vi.fn(),
  onClearCache: vi.fn(async () => undefined),
  showDeveloperSection: false,
};

describe('Profile', () => {
  it('renders display name, email, company when user is populated', () => {
    const tree = render(<Profile {...defaults} />);
    const text = collectText(tree.toJSON());
    expect(text).toContain('Jordan Sims');
    expect(text).toContain('test@example.com');
    expect(text).toContain('Sims Construction');
  });

  it('falls back to placeholder copy when user fields are null', () => {
    const tree = render(
      <Profile
        {...defaults}
        user={{ displayName: null, companyName: null, email: null }}
      />,
    );
    const text = collectText(tree.toJSON());
    expect(text).toContain('New User');
    expect(text).toContain('No email on file');
    expect(text).toContain('Add your company details');
  });

  it('invokes onPressAccount when the top user card is pressed', () => {
    const onPressAccount = vi.fn();
    const tree = render(
      <Profile {...defaults} onPressAccount={onPressAccount} />,
    );
    act(() =>
      tree.root.findByProps({ testID: 'btn-open-account' }).props.onPress(),
    );
    expect(onPressAccount).toHaveBeenCalledTimes(1);
  });

  it('does not render a separate Account Details row', () => {
    const tree = render(<Profile {...defaults} />);
    const text = collectText(tree.toJSON());
    expect(text).not.toContain('Account Details');
  });

  it('invokes onPressUsage when the Usage This Month row is pressed', () => {
    const onPressUsage = vi.fn();
    const tree = render(<Profile {...defaults} onPressUsage={onPressUsage} />);
    act(() =>
      tree.root.findByProps({ testID: 'btn-open-usage' }).props.onPress(),
    );
    expect(onPressUsage).toHaveBeenCalledTimes(1);
  });

  it('renders Usage This Month as a link row without inline stats', () => {
    const tree = render(<Profile {...defaults} />);
    const text = collectText(tree.toJSON());
    expect(text).toContain('Usage This Month');
    // No inline usage tile labels.
    expect(text).not.toContain('Reports');
    expect(text).not.toContain('Voice Notes');
  });

  it('hides the Developer row when showDeveloperSection is false', () => {
    const tree = render(<Profile {...defaults} showDeveloperSection={false} />);
    expect(
      tree.root.findAllByProps({ testID: 'btn-open-developer' }),
    ).toHaveLength(0);
  });

  it('shows the Developer row and invokes onPressDeveloper on press', () => {
    const onPressDeveloper = vi.fn();
    const tree = render(
      <Profile
        {...defaults}
        showDeveloperSection
        onPressDeveloper={onPressDeveloper}
      />,
    );
    act(() =>
      tree.root.findByProps({ testID: 'btn-open-developer' }).props.onPress(),
    );
    expect(onPressDeveloper).toHaveBeenCalledTimes(1);
  });

  it('invokes onSignOut when the Sign Out button is pressed', () => {
    const onSignOut = vi.fn();
    const tree = render(<Profile {...defaults} onSignOut={onSignOut} />);
    act(() =>
      tree.root.findByProps({ testID: 'btn-sign-out' }).props.onPress(),
    );
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('opens the clear-cache dialog and invokes onClearCache on confirm', async () => {
    const onClearCache = vi.fn(async () => undefined);
    const tree = render(
      <Profile {...defaults} onClearCache={onClearCache} />,
    );
    act(() =>
      tree.root.findByProps({ testID: 'btn-clear-cache' }).props.onPress(),
    );
    await act(async () => {
      tree.root
        .findByProps({ testID: 'btn-confirm-clear-cache' })
        .props.onPress();
    });
    expect(onClearCache).toHaveBeenCalledTimes(1);
  });

  it('renders build badge', () => {
    const tree = render(<Profile {...defaults} />);
    const badge = tree.root.findByProps({ testID: 'profile-build-badge' });
    expect(badge).toBeTruthy();
  });

  it('matches snapshot at default props', () => {
    const tree = render(<Profile {...defaults} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
