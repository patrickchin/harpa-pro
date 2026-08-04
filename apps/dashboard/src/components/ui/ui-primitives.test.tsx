import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge, BrandMark, Button, Card, Field, Input, TableShell } from './index';

describe('dashboard UI primitives', () => {
  it('renders the canonical brand mark with meaningful or decorative text alternatives', () => {
    const { container } = render(
      <>
        <BrandMark />
        <BrandMark decorative />
      </>,
    );

    expect(screen.getByRole('img', { name: 'Harpa Pro' }).getAttribute('src')).toMatch(
      /brand-icon\.svg|data:image\/svg\+xml/,
    );
    expect(container.querySelector('img[alt=""]')).toBeInTheDocument();
  });

  it('keeps routine and hero actions distinct while preserving mobile control sizing', () => {
    render(
      <>
        <Button>Save changes</Button>
        <Button variant="hero">Generate report</Button>
        <Button variant="destructive">Delete project</Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveClass(
      'min-h-11',
      'bg-primary',
      'font-semibold',
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).not.toHaveClass('font-bold');
    expect(screen.getByRole('button', { name: 'Generate report' })).toHaveClass('bg-accent');
    expect(screen.getByRole('button', { name: 'Delete project' })).toHaveClass(
      'border-danger-border',
      'bg-danger-soft',
    );
  });

  it('uses the shared mobile surface, field, and status language', () => {
    render(
      <Card>
        <Field label="Project name" optional>
          <Input name="name" />
        </Field>
        <Badge tone="owner">Owner</Badge>
      </Card>,
    );

    expect(screen.getByText('Project name')).toHaveClass('text-label', 'text-muted-foreground');
    expect(screen.getByText('Project name').parentElement).not.toHaveClass('font-bold');
    expect(screen.getByText('Project name').parentElement).not.toHaveClass('uppercase');
    expect(screen.getByText('Project name').parentElement).not.toHaveClass('tracking-label');
    expect(screen.getByRole('textbox', { name: /project name/i })).toHaveClass(
      'font-normal',
      'min-h-11',
      'normal-case',
      'rounded-control-ui',
      'tracking-normal',
    );
    expect(screen.getByText('Owner')).toHaveClass('bg-warning-soft');
    expect(screen.getByText('Owner').closest('div')).toHaveClass(
      'rounded-card-ui',
      'shadow-raised-ui',
    );
  });

  it('keeps wide desktop tables reachable instead of clipping their columns', () => {
    render(
      <TableShell data-testid="table-shell">
        <table>
          <tbody>
            <tr>
              <td>Report</td>
            </tr>
          </tbody>
        </table>
      </TableShell>,
    );

    expect(screen.getByTestId('table-shell')).toHaveClass('overflow-x-auto');
  });
});
