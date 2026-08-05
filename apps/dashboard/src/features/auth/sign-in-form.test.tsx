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
    expect(screen.getByRole('textbox', { name: 'Six-digit code' })).toHaveClass(
      'font-normal',
      'tracking-normal',
    );
    expect(screen.getByRole('textbox', { name: 'Six-digit code' })).not.toHaveClass('font-bold');

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
      <SignInForm onSendCode={onSendCode} onSignInWithPassword={vi.fn()} onVerifyCode={vi.fn()} />,
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
      <SignInForm onSendCode={onSendCode} onSignInWithPassword={vi.fn()} onVerifyCode={vi.fn()} />,
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

    await user.type(screen.getByRole('textbox', { name: 'Email address' }), ' DEMO2@HARPAPRO.COM ');
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

  it('uses the password path for an explicitly configured preview account', async () => {
    const user = userEvent.setup();
    const onSendCode = vi.fn().mockResolvedValue(undefined);
    const onSignInWithPassword = vi.fn().mockResolvedValue(undefined);
    render(
      <SignInForm
        onSendCode={onSendCode}
        onSignInWithPassword={onSignInWithPassword}
        onVerifyCode={vi.fn()}
        passwordAccountEmails={['test+1@harpapro.com']}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'TEST+1@HARPAPRO.COM');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    expect(onSendCode).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Password'), 'preview-account-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSignInWithPassword).toHaveBeenCalledWith({
      email: 'test+1@harpapro.com',
      password: 'preview-account-password',
    });
  });

  it('lets a demo account fall back to the normal email code flow', async () => {
    const user = userEvent.setup();
    const onSendCode = vi.fn().mockResolvedValue(undefined);
    render(
      <SignInForm onSendCode={onSendCode} onSignInWithPassword={vi.fn()} onVerifyCode={vi.fn()} />,
    );

    await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'demo@harpapro.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    expect(onSendCode).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Password'), 'password-to-clear');
    await user.click(screen.getByRole('button', { name: 'Use email code instead' }));

    expect(onSendCode).toHaveBeenCalledOnce();
    expect(onSendCode).toHaveBeenCalledWith('demo@harpapro.com');
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Six-digit code' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Use another email' }));
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    expect(screen.getByLabelText('Password')).toHaveValue('');
  });
});
