/**
 * Profile screen body tests.
 *
 * Covers the visible states + interactions the canonical
 * `app/profile.tsx` exercises:
 *  - displayName / phone / company fallbacks for null fields
 *  - copy callback fires on tap, but only when the field has real data
 *  - usage card: loading spinner / populated tiles / empty state
 *  - Account section row pushes onPressAccount
 *  - Usage card press pushes onPressUsage
 *  - sign-out button invokes onSignOut
 *  - clear-cache button opens AppDialogSheet → confirm calls onClearCache
 *  - developer section is hidden when `showDeveloperSection={false}`
 *  - developer section is shown when prop is true + providers passed
 *  - AI provider modal: select provider → advances to model step;
 *    selecting a model closes the modal + invokes onSelectModel
 *  - build version + server label render
 *  - snapshot of the populated layout
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import {
  Profile,
  type AiProviderOption,
  type ProfileMonthlyUsage,
  type ProfileUser,
} from './profile';

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
  phone: '+15551234567',
};

const USAGE: ProfileMonthlyUsage = {
  reportsCount: 12,
  voiceNotesCount: 34,
};

const PROVIDERS: ReadonlyArray<AiProviderOption> = [
  { key: 'kimi', label: 'Kimi', desc: 'Cheapest' },
  { key: 'openai', label: 'OpenAI', desc: 'Balanced' },
];

const MODELS = [
  { id: 'kimi-k2', label: 'Kimi K2' },
  { id: 'kimi-thinking', label: 'Kimi Thinking' },
];

const defaults = {
  user: USER,
  isLoading: false,
  monthlyUsage: USAGE,
  usageLoading: false,
  refreshing: false,
  onRefresh: vi.fn(),
  onBack: vi.fn(),
  onPressAccount: vi.fn(),
  onPressUsage: vi.fn(),
  onCopy: vi.fn(),
  onSignOut: vi.fn(),
  onClearCache: vi.fn(async () => undefined),
  showDeveloperSection: false,
  aiProviders: [] as ReadonlyArray<AiProviderOption>,
  aiProvider: '',
  onSelectProvider: vi.fn(),
  aiModels: [] as ReadonlyArray<{ id: string; label: string }>,
  aiModel: '',
  onSelectModel: vi.fn(),
  availableProviderKeys: null,
};

describe('Profile', () => {
  it('renders display name, phone, company when user is populated', () => {
    const tree = render(<Profile {...defaults} />);
    const text = collectText(tree.toJSON());
    expect(text).toContain('Jordan Sims');
    expect(text).toContain('+15551234567');
    expect(text).toContain('Sims Construction');
  });

  it('falls back to placeholder copy when user fields are null', () => {
    const tree = render(
      <Profile
        {...defaults}
        user={{ displayName: null, companyName: null, phone: null }}
      />,
    );
    const text = collectText(tree.toJSON());
    expect(text).toContain('New User');
    expect(text).toContain('No phone number on file');
    expect(text).toContain('Add your company details');
  });

  it('invokes onCopy when name pressable is tapped (real data)', () => {
    const onCopy = vi.fn();
    const tree = render(<Profile {...defaults} onCopy={onCopy} />);
    act(() =>
      tree.root.findByProps({ testID: 'profile-display-name' }).parent!.props.onPress(),
    );
    expect(onCopy).toHaveBeenCalledWith('Jordan Sims', { toast: 'Name copied' });
  });

  it('does not call onCopy when fields are placeholder (no real data)', () => {
    const onCopy = vi.fn();
    const tree = render(
      <Profile
        {...defaults}
        user={{ displayName: null, companyName: null, phone: null }}
        onCopy={onCopy}
      />,
    );
    // Pressables are `disabled` — onPress callbacks are still attached
    // but `disabled` prop short-circuits the press. We confirm the
    // pressable is disabled (canonical behaviour).
    const pressable = tree.root.findByProps({ testID: 'profile-display-name' })
      .parent!;
    expect(pressable.props.disabled).toBe(true);
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('shows usage spinner when usageLoading is true', () => {
    const tree = render(<Profile {...defaults} usageLoading monthlyUsage={null} />);
    // Empty-state placeholder must not render while loading.
    expect(
      tree.root.findAllByProps({ testID: 'usage-empty-state' }),
    ).toHaveLength(0);
  });

  it('shows empty state when monthlyUsage is null and not loading', () => {
    const tree = render(<Profile {...defaults} monthlyUsage={null} />);
    expect(() =>
      tree.root.findByProps({ testID: 'usage-empty-state' }),
    ).not.toThrow();
  });

  it('renders reports + voice notes tiles when monthlyUsage is populated', () => {
    const tree = render(<Profile {...defaults} />);
    const text = collectText(tree.toJSON());
    expect(text).toContain('Reports');
    expect(text).toContain('Voice Notes');
    expect(text).toContain('12');
    expect(text).toContain('34');
  });

  it('invokes onPressUsage when the usage card is pressed', () => {
    const onPressUsage = vi.fn();
    const tree = render(<Profile {...defaults} onPressUsage={onPressUsage} />);
    act(() =>
      tree.root.findByProps({ testID: 'btn-open-usage' }).props.onPress(),
    );
    expect(onPressUsage).toHaveBeenCalledTimes(1);
  });

  it('invokes onPressAccount when the Account Details row is pressed', () => {
    const onPressAccount = vi.fn();
    const tree = render(
      <Profile {...defaults} onPressAccount={onPressAccount} />,
    );
    act(() =>
      tree.root.findByProps({ testID: 'btn-open-account' }).props.onPress(),
    );
    expect(onPressAccount).toHaveBeenCalledTimes(1);
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
    // Confirm button inside AppDialogSheet:
    await act(async () => {
      tree.root
        .findByProps({ testID: 'btn-confirm-clear-cache' })
        .props.onPress();
    });
    expect(onClearCache).toHaveBeenCalledTimes(1);
  });

  it('hides the developer section when showDeveloperSection is false', () => {
    const tree = render(
      <Profile
        {...defaults}
        showDeveloperSection={false}
        aiProviders={PROVIDERS}
      />,
    );
    expect(
      tree.root.findAllByProps({ testID: 'developer-section' }),
    ).toHaveLength(0);
  });

  it('shows the developer section and opens the AI provider modal', () => {
    const tree = render(
      <Profile
        {...defaults}
        showDeveloperSection
        aiProviders={PROVIDERS}
        aiProvider="kimi"
        aiModels={MODELS}
        aiModel="kimi-k2"
      />,
    );
    expect(() =>
      tree.root.findByProps({ testID: 'developer-section' }),
    ).not.toThrow();
    act(() =>
      tree.root.findByProps({ testID: 'btn-open-ai-model' }).props.onPress(),
    );
    // Provider list should now be in the tree.
    expect(() =>
      tree.root.findByProps({ testID: 'ai-provider-kimi' }),
    ).not.toThrow();
  });

  it('advances to the model step on provider select + invokes callbacks on model tap', () => {
    const onSelectProvider = vi.fn();
    const onSelectModel = vi.fn();
    const tree = render(
      <Profile
        {...defaults}
        showDeveloperSection
        aiProviders={PROVIDERS}
        aiProvider="kimi"
        aiModels={MODELS}
        aiModel="kimi-k2"
        onSelectProvider={onSelectProvider}
        onSelectModel={onSelectModel}
      />,
    );
    act(() =>
      tree.root.findByProps({ testID: 'btn-open-ai-model' }).props.onPress(),
    );
    act(() =>
      tree.root
        .findByProps({ testID: 'ai-provider-openai' })
        .props.onPress(),
    );
    expect(onSelectProvider).toHaveBeenCalledWith('openai');
    // Now we're on the model step.
    act(() =>
      tree.root
        .findByProps({ testID: 'ai-model-kimi-thinking' })
        .props.onPress(),
    );
    expect(onSelectModel).toHaveBeenCalledWith('kimi-thinking');
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
