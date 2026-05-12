import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import SignUpVerify from './sign-up-verify';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('SignUpVerify', () => {
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
    const tree = render(<SignUpVerify {...defaultProps} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('disables verify button when otp length < 6', () => {
    const treeShort = render(<SignUpVerify {...defaultProps} otp="123" />);
    const buttonShort = treeShort.root.findByProps({ testID: 'btn-signup-verify' });
    expect(buttonShort.props.disabled).toBe(true);

    const treeExact = render(<SignUpVerify {...defaultProps} otp="123456" />);
    const buttonExact = treeExact.root.findByProps({ testID: 'btn-signup-verify' });
    expect(buttonExact.props.disabled).toBe(false);
  });

  it('changes verify button label and shows loading while isSubmitting', () => {
    const tree = render(<SignUpVerify {...defaultProps} otp="123456" isSubmitting={true} />);
    const button = tree.root.findByProps({ testID: 'btn-signup-verify' });
    expect(button.props.loading).toBe(true);
    
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Verifying…');

    const treeIdle = render(<SignUpVerify {...defaultProps} otp="123456" isSubmitting={false} />);
    const jsonIdle = JSON.stringify(treeIdle.toJSON());
    expect(jsonIdle).toContain('Verify');
    expect(jsonIdle).not.toContain('Verifying…');
  });

  it('renders "Resend in {n}s" when resendCountdownSeconds is not null', () => {
    const treeWithCountdown = render(
      <SignUpVerify {...defaultProps} resendCountdownSeconds={15} />
    );
    const json = JSON.stringify(treeWithCountdown.toJSON());
    expect(json).toContain('Resend in 15s');

    const treeNoCountdown = render(
      <SignUpVerify {...defaultProps} resendCountdownSeconds={null} />
    );
    const jsonNoCountdown = JSON.stringify(treeNoCountdown.toJSON());
    expect(jsonNoCountdown).toContain('Resend Code');
    expect(jsonNoCountdown).toContain("Didn't get the code?");
    expect(jsonNoCountdown).not.toContain('Resend in');
  });

  it('disables resend link when resendDisabled is true', () => {
    const tree = render(<SignUpVerify {...defaultProps} resendDisabled={true} />);
    const link = tree.root.findByProps({ testID: 'link-signup-resend-code' });
    expect(link.props.disabled).toBe(true);
  });

  it('renders error InlineNotice when error is provided', () => {
    const tree = render(
      <SignUpVerify {...defaultProps} error="Invalid verification code." />
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Invalid verification code.');
  });

  it('renders info InlineNotice when info is provided', () => {
    const tree = render(
      <SignUpVerify {...defaultProps} info="Code sent successfully." />
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Code sent successfully.');
  });

  it('renders "Code sent to {phone}" read-only label', () => {
    const tree = render(<SignUpVerify {...defaultProps} phone="+15559876543" />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('+15559876543');
    expect(json).toContain('Code sent to');
  });

  it('calls onChangeNumber when "Change Number" button is pressed', () => {
    const onChangeNumber = vi.fn();
    const tree = render(<SignUpVerify {...defaultProps} onChangeNumber={onChangeNumber} />);
    const button = tree.root.findByProps({ testID: 'btn-signup-change-number' });
    act(() => {
      button.props.onPress();
    });
    expect(onChangeNumber).toHaveBeenCalledTimes(1);
  });

  it('calls onChangeNumber when back arrow is pressed', () => {
    const onChangeNumber = vi.fn();
    const tree = render(<SignUpVerify {...defaultProps} onChangeNumber={onChangeNumber} />);
    const button = tree.root.findByProps({ testID: 'btn-signup-verify-back' });
    act(() => {
      button.props.onPress();
    });
    expect(onChangeNumber).toHaveBeenCalledTimes(1);
  });

  it('does not call onResend when disabled', () => {
    const onResend = vi.fn();
    const tree = render(
      <SignUpVerify {...defaultProps} onResend={onResend} resendDisabled={true} />
    );
    const link = tree.root.findByProps({ testID: 'link-signup-resend-code' });
    expect(link.props.disabled).toBe(true);
    expect(onResend).not.toHaveBeenCalled();
  });

  it('disables Change Number button when isSubmitting', () => {
    const tree = render(<SignUpVerify {...defaultProps} isSubmitting={true} />);
    const button = tree.root.findByProps({ testID: 'btn-signup-change-number' });
    expect(button.props.disabled).toBe(true);
  });

  it('renders "Create Account" header text', () => {
    const tree = render(<SignUpVerify {...defaultProps} />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Create Account');
  });
});
