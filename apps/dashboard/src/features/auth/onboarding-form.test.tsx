import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OnboardingForm } from './onboarding-form';

describe('OnboardingForm', () => {
  it('requires a display name and submits an optional company', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<OnboardingForm email="manager@example.com" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your full name.');

    await user.type(screen.getByRole('textbox', { name: 'Full name' }), '  Morgan Lee  ');
    await user.type(screen.getByRole('textbox', { name: 'Company' }), '  Northstar Builders  ');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onSubmit).toHaveBeenCalledWith({
      displayName: 'Morgan Lee',
      companyName: 'Northstar Builders',
    });
  });

  it('shows the immutable signed-in email for orientation', () => {
    render(<OnboardingForm email="manager@example.com" onSubmit={vi.fn()} />);

    expect(screen.getByText('manager@example.com')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Email address' })).not.toBeInTheDocument();
  });
});
