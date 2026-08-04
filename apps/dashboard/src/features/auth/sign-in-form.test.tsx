import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SignInForm } from './sign-in-form';

describe('SignInForm', () => {
  it('requests a code, then verifies the six-digit code', async () => {
    const user = userEvent.setup();
    const onSendCode = vi.fn().mockResolvedValue(undefined);
    const onVerifyCode = vi.fn().mockResolvedValue(undefined);
    render(
      <SignInForm
        onSendCode={onSendCode}
        onSignInWithPassword={vi.fn()}
        onVerifyCode={onVerifyCode}
      />,
    );

    expect(screen.getByRole('img', { name: 'Harpa Pro' }).getAttribute('src')).toMatch(
      /brand-icon\.svg|data:image\/svg\+xml/,
    );
    await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'manager@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    expect(onSendCode).toHaveBeenCalledWith('manager@example.com');
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    expect(screen.getByText('manager@example.com')).toBeVisible();

    await user.type(screen.getByRole('textbox', { name: 'Six-digit code' }), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify code' }));

    expect(onVerifyCode).toHaveBeenCalledWith({
      email: 'manager@example.com',
      otp: '123456',
    });
  });

  it('validates user input before calling auth', async () => {
    const user = userEvent.setup();
    const onSendCode = vi.fn().mockResolvedValue(undefined);
    render(
      <SignInForm
        onSendCode={onSendCode}
        onSignInWithPassword={vi.fn()}
        onVerifyCode={vi.fn()}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    expect(onSendCode).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
  });

  it('keeps the user on the current step and announces auth errors', async () => {
    const user = userEvent.setup();
    const onSendCode = vi.fn().mockRejectedValue(new Error('Email delivery is unavailable.'));
    render(
      <SignInForm
        onSendCode={onSendCode}
        onSignInWithPassword={vi.fn()}
        onVerifyCode={vi.fn()}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'manager@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Email delivery is unavailable.');
    expect(screen.getByRole('button', { name: 'Send code' })).toBeEnabled();
  });

  it('uses a password for a supported demo email without requesting an OTP', async () => {
    const user = userEvent.setup();
    const onSendCode = vi.fn().mockResolvedValue(undefined);
    const onSignInWithPassword = vi.fn().mockResolvedValue(undefined);
    render(
      <SignInForm
        onSendCode={onSendCode}
        onSignInWithPassword={onSignInWithPassword}
        onVerifyCode={vi.fn()}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Email address' }),
      ' DEMO2@HARPAPRO.COM ',
    );
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    expect(onSendCode).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Enter your password' })).toBeVisible();
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveFocus();
    expect(screen.queryByRole('textbox', { name: 'Six-digit code' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();

    await user.type(password, 'demo-password-for-dashboard');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(onSignInWithPassword).toHaveBeenCalledWith({
      email: 'demo2@harpapro.com',
      password: 'demo-password-for-dashboard',
    });
  });
});
