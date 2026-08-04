import type { projects } from '@harpa/api-contract';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

import { MembersPageView } from './members-page-view';

const members: Array<z.infer<typeof projects.projectMember>> = [
  {
    userId: 'usr_owner',
    displayName: 'Morgan Lee',
    email: 'morgan@example.com',
    role: 'owner',
    joinedAt: '2026-07-01T00:00:00.000Z',
  },
  {
    userId: 'usr_editor',
    displayName: 'Riley Chen',
    email: 'riley@example.com',
    role: 'editor',
    joinedAt: '2026-07-03T00:00:00.000Z',
  },
];

describe('MembersPageView', () => {
  it('uses a desktop table and stacked member cards below the large breakpoint', () => {
    render(
      <MembersPageView
        members={members}
        myRole="viewer"
        currentUserId="usr_viewer"
        onAddMember={vi.fn()}
        onChangeRole={vi.fn()}
        onRemoveMember={vi.fn()}
      />,
    );

    expect(screen.getByTestId('members-desktop-table')).toHaveClass('hidden', 'lg:block');
    expect(screen.getByTestId('members-mobile-list')).toHaveClass(
      'grid',
      'gap-3',
      'lg:hidden',
    );
    expect(screen.getAllByTestId('member-mobile-card')).toHaveLength(members.length);
  });

  it('lets every member read the team without leaking owner controls', () => {
    render(
      <MembersPageView
        members={members}
        myRole="viewer"
        currentUserId="usr_viewer"
        onAddMember={vi.fn()}
        onChangeRole={vi.fn()}
        onRemoveMember={vi.fn()}
      />,
    );

    const desktopTable = within(screen.getByTestId('members-desktop-table'));
    const mobileList = within(screen.getByTestId('members-mobile-list'));

    expect(desktopTable.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    expect(desktopTable.getByText('Riley Chen')).toBeVisible();
    expect(mobileList.getByText('Riley Chen')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
  });

  it('adds an existing account with any project role', async () => {
    const user = userEvent.setup();
    const onAddMember = vi.fn().mockResolvedValue(undefined);
    render(
      <MembersPageView
        members={members}
        myRole="owner"
        currentUserId="usr_owner"
        onAddMember={onAddMember}
        onChangeRole={vi.fn()}
        onRemoveMember={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add member' }));
    expect(screen.getByText(/already have a Harpa Pro account/i)).toBeVisible();
    expect(screen.queryByText(/invitation sent/i)).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'casey@example.com');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Project role' }), 'owner');
    await user.click(
      within(screen.getByRole('dialog', { name: 'Add member' })).getByRole('button', {
        name: 'Add member',
      }),
    );

    expect(onAddMember).toHaveBeenCalledWith({
      email: 'casey@example.com',
      role: 'owner',
    });
  });

  it('focuses member dialogs and restores their triggers after Escape', async () => {
    const user = userEvent.setup();
    render(
      <MembersPageView
        members={members}
        myRole="owner"
        currentUserId="usr_owner"
        onAddMember={vi.fn()}
        onChangeRole={vi.fn()}
        onRemoveMember={vi.fn()}
      />,
    );

    const addTrigger = screen.getByRole('button', { name: 'Add member' });
    await user.click(addTrigger);
    expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(addTrigger).toHaveFocus();

    const removeTrigger = within(screen.getByTestId('members-desktop-table')).getByRole('button', {
      name: 'Remove Riley Chen',
    });
    await user.click(removeTrigger);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(removeTrigger).toHaveFocus();
  });

  it('protects the last owner before a mutation is submitted', () => {
    render(
      <MembersPageView
        members={members}
        myRole="owner"
        currentUserId="usr_owner"
        onAddMember={vi.fn()}
        onChangeRole={vi.fn()}
        onRemoveMember={vi.fn()}
      />,
    );

    const desktopTable = within(screen.getByTestId('members-desktop-table'));

    expect(desktopTable.getByRole('combobox', { name: 'Change role for Morgan Lee' })).toBeDisabled();
    expect(desktopTable.getByRole('button', { name: 'Remove Morgan Lee' })).toBeDisabled();
    expect(desktopTable.getByText(/add another owner first/i)).toBeVisible();
  });

  it('changes roles and removes non-owner members', async () => {
    const user = userEvent.setup();
    const onChangeRole = vi.fn().mockResolvedValue(undefined);
    const onRemoveMember = vi.fn().mockResolvedValue(undefined);
    render(
      <MembersPageView
        members={members}
        myRole="owner"
        currentUserId="usr_owner"
        onAddMember={vi.fn()}
        onChangeRole={onChangeRole}
        onRemoveMember={onRemoveMember}
      />,
    );

    const mobileList = within(screen.getByTestId('members-mobile-list'));

    await user.selectOptions(
      mobileList.getByRole('combobox', { name: 'Change role for Riley Chen' }),
      'viewer',
    );
    expect(onChangeRole).toHaveBeenCalledWith('usr_editor', 'viewer');

    await user.click(mobileList.getByRole('button', { name: 'Remove Riley Chen' }));
    expect(screen.getByRole('dialog', { name: 'Remove Riley Chen' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Confirm removal' }));
    expect(onRemoveMember).toHaveBeenCalledWith('usr_editor');
  });
});
