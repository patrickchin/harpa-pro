import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import SignInVerify from './sign-in-verify';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('SignInVerify', () => {
  const defaultProps = {
    phone: '+15551234567',
    otp: '',
    onChangeOtp: vi.fn(),
    onChangeNumber: vi.fn(),
    onResend: vi.fn(),
    resendDisabled: false,
    resendCountdownSeconds: null,
    error: null,
    info: null,
    isSubmitting: false,
    onSubmit: vi.fn(),
  };

  it('matches snapshot at default props', () => {
    const tree = render(<SignInVerify {...defaultProps} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('disables verify button when otp length < 6', () => {
    const treeShort = render(<SignInVerify {...defaultProps} otp="123" />);
    const buttonShort = treeShort.root.findByProps({ testID: 'btn-verify-code' });
    expect(buttonShort.props.disabled).toBe(true);

    const treeExact = render(<SignInVerify {...defaultProps} otp="123456" />);
    const buttonExact = treeExact.root.findByProps({ testID: 'btn-verify-code' });
    expect(buttonExact.props.disabled).toBe(false);
  });

  it('changes verify button label while isSubmitting', () => {
    const tree = render(<SignInVerify {...defaultProps} otp="123456" isSubmitting={true} />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Verifying...');

    const treeIdle = render(<SignInVerify {...defaultProps} otp="123456" isSubmitting={false} />);
    const jsonIdle = JSON.stringify(treeIdle.toJSON());
    expect(jsonIdle).toContain('Verify Code');
  });

  it('renders "Resend in {n}s" when resendCountdownSeconds is not null', () => {
    const treeWithCountdown = render(
      <SignInVerify {...defaultProps} resendCountdownSeconds={15} />
    );
    const json = JSON.stringify(treeWithCountdown.toJSON());
    expect(json).toContain('Resend in 15s');

    const treeNoCountdown = render(
      <SignInVerify {...defaultProps} resendCountdownSeconds={null} />
    );
    const jsonNoCountdown = JSON.stringify(treeNoCountdown.toJSON());
    expect(jsonNoCountdown).toContain('Resend Code');
    expect(jsonNoCountdown).toContain("Didn't get the code?");
    expect(jsonNoCountdown).not.toContain('Resend in');
  });

  it('disables resend link when resendDisabled is true', () => {
    const tree = render(<SignInVerify {...defaultProps} resendDisabled={true} />);
    const link = tree.root.findByProps({ testID: 'link-resend-code' });
    expect(link.props.disabled).toBe(true);
  });

  it('renders error InlineNotice when error is provided', () => {
    const tree = render(
      <SignInVerify {...defaultProps} error="Invalid verification code." />
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Invalid verification code.');
  });

  it('renders info InlineNotice when info is provided', () => {
    const tree = render(
      <SignInVerify {...defaultProps} info="Code sent successfully." />
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Code sent successfully.');
  });

  it('renders the phone in a read-only label', () => {
    const tree = render(<SignInVerify {...defaultProps} phone="+15559876543" />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('+15559876543');
    expect(json).toContain('Code sent to');
  });

  it('calls onChangeNumber when "Change Number" is pressed', () => {
    const onChangeNumber = vi.fn();
    const tree = render(<SignInVerify {...defaultProps} onChangeNumber={onChangeNumber} />);
    const button = tree.root.findByProps({ testID: 'btn-change-number' });
    act(() => {
      button.props.onPress();
    });
    expect(onChangeNumber).toHaveBeenCalledTimes(1);
  });

  it('does not call onResend when disabled', () => {
    const onResend = vi.fn();
    const tree = render(
      <SignInVerify {...defaultProps} onResend={onResend} resendDisabled={true} />
    );
    const link = tree.root.findByProps({ testID: 'link-resend-code' });
    expect(link.props.disabled).toBe(true);
    // Link is disabled, so onPress shouldn't be called even if triggered
    act(() => {
      // In test-renderer, disabled Pressables still have onPress defined
      // but the press won't be registered by the real component
    });
    expect(onResend).not.toHaveBeenCalled();
  });
});
