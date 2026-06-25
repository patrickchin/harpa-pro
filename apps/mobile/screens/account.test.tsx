/**
 * Account screen body tests.
 *
 * Covers the visible states + interactions the canonical
 * `app/account.tsx` exercises:
 *  - skeleton when profile is null (loading)
 *  - read-only form with email / full name / company filled
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
  email: 'jordan@example.com',
  fullName: 'Jordan Sims',
  companyName: 'Sims Construction',
};

const defaults = {
  profile: baseProfile,
  refreshing: false,
  onRefresh: vi.fn(),
  onBack: vi.fn(),
};

const deletionPreview = {
  email: 'jordan@example.com',
  soloProjectsDeleted: [{ id: 'prj_1234abcd', name: 'Solo Project' }],
  sharedProjectsTransferred: [
    {
      id: 'prj_2345bcde',
      name: 'Shared Project',
      newOwnerId: 'usr_3456cdef',
      newOwnerEmail: 'owner@example.com',
    },
  ],
  sharedProjectsLeft: [{ id: 'prj_4567defg', name: 'Member Project' }],
  personalFilesDeleted: 2,
};

describe('Account', () => {
  it('renders skeleton when profile is null', () => {
    const tree = render(<Account {...defaults} profile={null} />);
    expect(() =>
      tree.root.findByProps({ testID: 'screen-account-loading' }),
    ).not.toThrow();
    expect(collectText(tree.toJSON())).not.toContain('Jordan Sims');
  });

  it('renders email / full name / company when loaded', () => {
    const tree = render(<Account {...defaults} />);
    const text = collectText(tree.toJSON());
    expect(text).toContain('Account Details');
    expect(text).toContain('Email');
    expect(text).toContain('Full Name');
    expect(text).toContain('Company Name');
    // Input values live in TextInput `value` props, not children:
    const inputs = tree.root.findAllByType('rn-TextInput' as any);
    const values = inputs.map((i) => i.props.value);
    expect(values).toContain('jordan@example.com');
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
    expect(values).toContain('jordan@example.com');
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

  it('hides edit button when onSaveProfile is not provided', () => {
    const tree = render(<Account {...defaults} />);
    expect(
      tree.root.findAllByProps({ testID: 'btn-edit-profile' }),
    ).toHaveLength(0);
  });

  it('shows Edit button when onSaveProfile is provided', () => {
    const tree = render(
      <Account {...defaults} onSaveProfile={vi.fn().mockResolvedValue(undefined)} />,
    );
    expect(() =>
      tree.root.findByProps({ testID: 'btn-edit-profile' }),
    ).not.toThrow();
  });

  it('flips Full Name + Company Name to editable when Edit is pressed and calls onSaveProfile on Save', async () => {
    const onSaveProfile = vi.fn().mockResolvedValue(undefined);
    const tree = render(
      <Account {...defaults} onSaveProfile={onSaveProfile} />,
    );

    // Initially read-only.
    const initialName = tree.root.findByProps({ testID: 'input-full-name' });
    expect(initialName.props.editable).toBe(false);

    act(() => {
      tree.root.findByProps({ testID: 'btn-edit-profile' }).props.onPress();
    });

    // Now editable.
    expect(
      tree.root.findByProps({ testID: 'input-full-name' }).props.editable,
    ).toBe(true);

    // Change the name + company.
    act(() => {
      tree.root
        .findByProps({ testID: 'input-full-name' })
        .props.onChangeText('Riley Stone');
    });
    act(() => {
      tree.root
        .findByProps({ testID: 'input-company-name' })
        .props.onChangeText('Stone Builders');
    });

    await act(async () => {
      await tree.root.findByProps({ testID: 'btn-save-profile' }).props.onPress();
    });

    expect(onSaveProfile).toHaveBeenCalledWith({
      displayName: 'Riley Stone',
      companyName: 'Stone Builders',
    });
  });

  it('reverts inputs on Cancel', () => {
    const tree = render(
      <Account {...defaults} onSaveProfile={vi.fn().mockResolvedValue(undefined)} />,
    );
    act(() => {
      tree.root.findByProps({ testID: 'btn-edit-profile' }).props.onPress();
    });
    act(() => {
      tree.root
        .findByProps({ testID: 'input-full-name' })
        .props.onChangeText('Different');
    });
    act(() => {
      tree.root.findByProps({ testID: 'btn-cancel-edit' }).props.onPress();
    });
    expect(
      tree.root.findByProps({ testID: 'input-full-name' }).props.value,
    ).toBe('Jordan Sims');
  });

  it('renders saveError when provided', () => {
    const tree = render(
      <Account
        {...defaults}
        onSaveProfile={vi.fn().mockResolvedValue(undefined)}
        saveError="Could not save"
      />,
    );
    expect(() =>
      tree.root.findByProps({ testID: 'account-save-error' }),
    ).not.toThrow();
    expect(collectText(tree.toJSON())).toContain('Could not save');
  });

  it('shows Delete account when account deletion props are provided', () => {
    const tree = render(
      <Account
        {...defaults}
        deletionPreview={deletionPreview}
        onRequestDeletionPreview={vi.fn()}
        onDeleteAccount={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(() =>
      tree.root.findByProps({ testID: 'btn-open-delete-account' }),
    ).not.toThrow();
    expect(collectText(tree.toJSON())).toContain('Delete account');
  });

  it('opens the delete dialog and requests the latest preview', async () => {
    const onRequestDeletionPreview = vi.fn().mockResolvedValue(undefined);
    const tree = render(
      <Account
        {...defaults}
        deletionPreview={deletionPreview}
        onRequestDeletionPreview={onRequestDeletionPreview}
        onDeleteAccount={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await act(async () => {
      tree.root
        .findByProps({ testID: 'btn-open-delete-account' })
        .props.onPress();
    });

    expect(onRequestDeletionPreview).toHaveBeenCalledTimes(1);
    expect(collectText(tree.toJSON())).toContain('Solo Project');
    expect(collectText(tree.toJSON())).toContain('Shared Project');
  });

  it('requires typing the account email before confirming deletion', async () => {
    const onDeleteAccount = vi.fn().mockResolvedValue(undefined);
    const tree = render(
      <Account
        {...defaults}
        deletionPreview={deletionPreview}
        onRequestDeletionPreview={vi.fn()}
        onDeleteAccount={onDeleteAccount}
      />,
    );

    await act(async () => {
      tree.root
        .findByProps({ testID: 'btn-open-delete-account' })
        .props.onPress();
    });

    expect(
      tree.root.findByProps({ testID: 'btn-confirm-delete-account' }).props
        .disabled,
    ).toBe(true);

    act(() => {
      tree.root
        .findByProps({ testID: 'input-delete-account-email' })
        .props.onChangeText('jordan@example.com');
    });

    expect(
      tree.root.findByProps({ testID: 'btn-confirm-delete-account' }).props
        .disabled,
    ).toBe(false);

    await act(async () => {
      await tree.root
        .findByProps({ testID: 'btn-confirm-delete-account' })
        .props.onPress();
    });
    expect(onDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it('shows pending and error states in the delete dialog', async () => {
    const tree = render(
      <Account
        {...defaults}
        deletionPreview={deletionPreview}
        onRequestDeletionPreview={vi.fn()}
        onDeleteAccount={vi.fn().mockResolvedValue(undefined)}
        isDeletingAccount
        deleteAccountError="Deletion failed"
      />,
    );

    await act(async () => {
      tree.root
        .findByProps({ testID: 'btn-open-delete-account' })
        .props.onPress();
    });

    const text = collectText(tree.toJSON());
    expect(text).toContain('Deleting…');
    expect(text).toContain('Deletion failed');
  });
});
