import type { projects } from '@harpa/api-contract';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProjectSettingsPanel } from './project-settings-panel';

const project: projects.Project = {
  id: 'prj_1',
  name: 'Harbor House',
  clientName: 'Northstar Developments',
  address: '18 Pier Road',
  ownerId: 'usr_1',
  myRole: 'owner',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-29T08:00:00.000Z',
};

describe('ProjectSettingsPanel', () => {
  it('lets editors update metadata without exposing project deletion', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectSettingsPanel
        project={{ ...project, myRole: 'editor' }}
        onSave={onSave}
        onDelete={vi.fn()}
      />,
    );

    await user.clear(screen.getByRole('textbox', { name: 'Project name' }));
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), 'Harbor House Phase 2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith({
      name: 'Harbor House Phase 2',
      clientName: 'Northstar Developments',
      address: '18 Pier Road',
    });
    expect(screen.queryByRole('button', { name: 'Delete project' })).not.toBeInTheDocument();
  });

  it('requires owners to type the project name before deleting', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<ProjectSettingsPanel project={project} onSave={vi.fn()} onDelete={onDelete} />);

    await user.click(screen.getByRole('button', { name: 'Delete project' }));
    expect(screen.getByText(/reports and attached project records are removed/i)).toBeVisible();
    const confirm = screen.getByRole('button', {
      name: 'Permanently delete project',
    });
    expect(confirm).toBeDisabled();

    await user.type(
      screen.getByRole('textbox', {
        name: 'Type Harbor House to confirm',
      }),
      'Harbor House',
    );
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('enters project deletion and restores the trigger after Escape', async () => {
    const user = userEvent.setup();
    render(<ProjectSettingsPanel project={project} onSave={vi.fn()} onDelete={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'Delete project' });
    await user.click(trigger);
    expect(
      screen.getByRole('textbox', {
        name: 'Type Harbor House to confirm',
      }),
    ).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('renders project details read-only for viewers', () => {
    render(
      <ProjectSettingsPanel
        project={{ ...project, myRole: 'viewer' }}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('Northstar Developments')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  it('uses mobile-sized controls and a narrow readable settings column', () => {
    render(<ProjectSettingsPanel project={project} onSave={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveClass('min-h-11');
    expect(screen.getByRole('textbox', { name: 'Address' })).toHaveClass('min-h-28');
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveClass('min-h-11');
    expect(screen.getByRole('heading', { name: 'Project details' }).closest('section')).toHaveClass(
      'max-w-3xl',
    );
  });
});
