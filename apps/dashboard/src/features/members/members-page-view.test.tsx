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
  it('matches the mobile member hierarchy and compact page rhythm', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MembersPageView
        members={members}
        myRole="owner"
        currentUserId="usr_owner"
        onAddMember={vi.fn()}
        onChangeRole={vi.fn()}
        onRemoveMember={vi.fn()}
      />,
    );

    expect(container.firstElementChild).toHaveClass('gap-6');
    expect(container.querySelector('[class~="font-extrabold"]')).not.toBeInTheDocument();

    const desktopTable = within(screen.getByTestId('members-desktop-table'));
    const desktopName = desktopTable.getByText('Riley Chen');
    expect(desktopName.parentElement).toHaveClass('font-semibold');
    expect(desktopTable.getByRole('link', { name: 'riley@example.com' })).not.toHaveClass(
      'font-medium',
    );

    const mobileList = within(screen.getByTestId('members-mobile-list'));
    const mobileName = mobileList.getByRole('heading', { name: 'Riley Chen' });
    const mobileCard = mobileName.closest('[data-testid="member-mobile-card"]');
    expect(mobileName).toHaveClass('font-semibold');
    expect(mobileList.getByRole('link', { name: 'riley@example.com' })).not.toHaveClass(
      'font-medium',
    );
    expect(mobileCard?.querySelector('dl')).toHaveClass('mt-3');
    for (const value of mobileCard?.querySelectorAll('dd') ?? []) {
      expect(value).toHaveClass('font-normal');
    }
    expect(
      mobileList
        .getByRole('combobox', { name: 'Change role for Riley Chen' })
        .closest('[class~="border-t"]'),
    ).toHaveClass('mt-3', 'pt-3');

    await user.click(screen.getByRole('button', { name: 'Add member' }));
    const dialog = screen.getByRole('dialog', { name: 'Add member' });
    expect(document.body.querySelector('[class~="font-extrabold"]')).not.toBeInTheDocument();
    expect(dialog.querySelector('#add-member-title')).toHaveClass('text-title-sm');
    expect(dialog.querySelector('#add-member-title')).not.toHaveClass('font-bold');
    expect(within(dialog).getByText(/The person must already have/i)).toHaveClass('font-normal');
    expect(within(dialog).getByRole('textbox', { name: 'Email address' }).closest('form')).toHaveClass(
      'mt-4',
      'gap-3',
    );
    for (const roleName of dialog.querySelectorAll('dt')) {
      expect(roleName).toHaveClass('font-semibold');
    }
  });

  it('keeps the compact loading state free of display-weight copy', () => {
    render(
      <MembersPageView
        isLoading
        members={members}
        myRole="viewer"
        currentUserId="usr_viewer"
        onAddMember={vi.fn()}
        onChangeRole={vi.fn()}
        onRemoveMember={vi.fn()}
      />,
    );

    const loadingState = screen.getByText('Loading members…');
    expect(loadingState).toHaveClass('font-normal');
    expect(loadingState.closest('[aria-busy="true"]')).toHaveClass('p-4');
  });

  it('validates and reports add-member failures without closing the compact dialog', async () => {
    const user = userEvent.setup();
    const onAddMember = vi.fn().mockRejectedValue(new Error('That account is already a member.'));
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
    const dialog = screen.getByRole('dialog', { name: 'Add member' });
    const email = within(dialog).getByRole('textbox', { name: 'Email address' });
    const submit = within(dialog).getByRole('button', { name: 'Add member' });

    await user.click(submit);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(onAddMember).not.toHaveBeenCalled();

    await user.type(email, 'casey@example.com');
    await user.click(submit);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'That account is already a member.',
    );
  });

  it('keeps role and removal failures visible for recovery', async () => {
    const user = userEvent.setup();
    render(
      <MembersPageView
        members={members}
        myRole="owner"
        currentUserId="usr_owner"
        onAddMember={vi.fn()}
        onChangeRole={vi.fn().mockRejectedValue(new Error('Could not save that role.'))}
        onRemoveMember={vi.fn().mockRejectedValue(new Error('Could not remove that member.'))}
      />,
    );

    const mobileList = within(screen.getByTestId('members-mobile-list'));
    await user.selectOptions(
      mobileList.getByRole('combobox', { name: 'Change role for Riley Chen' }),
      'viewer',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save that role.');

    await user.click(mobileList.getByRole('button', { name: 'Remove Riley Chen' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove Riley Chen' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirm removal' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Could not remove that member.',
    );
  });

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

    const desktopTable = within(screen.getByTestId('members-desktop-table'));
    const mobileList = within(screen.getByTestId('members-mobile-list'));

    await user.selectOptions(
      desktopTable.getByRole('combobox', { name: 'Change role for Riley Chen' }),
      'owner',
    );
    expect(onChangeRole).toHaveBeenCalledWith('usr_editor', 'owner');

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
