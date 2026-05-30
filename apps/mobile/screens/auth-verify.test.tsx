import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import AuthVerify from './auth-verify';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

const baseProps = {
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

describe('AuthVerify (signin)', () => {
  const props = { ...baseProps, mode: 'signin' as const };

  it('matches snapshot at default props', () => {
    const tree = render(<AuthVerify {...props} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('uses sign-in test IDs and omits the back button', () => {
    const tree = render(<AuthVerify {...props} />);
    expect(tree.root.findByProps({ testID: 'input-otp' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'btn-verify-code' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'btn-change-number' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'link-resend-code' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'btn-signup-verify-back' })).toHaveLength(0);
  });

  it('disables verify button when otp length < 6', () => {
    const treeShort = render(<AuthVerify {...props} otp="123" />);
    expect(treeShort.root.findByProps({ testID: 'btn-verify-code' }).props.disabled).toBe(true);

    const treeFull = render(<AuthVerify {...props} otp="123456" />);
    expect(treeFull.root.findByProps({ testID: 'btn-verify-code' }).props.disabled).toBe(false);
  });

  it('renders the resend countdown when set', () => {
    const tree = render(<AuthVerify {...props} resendCountdownSeconds={25} resendDisabled />);
    expect(JSON.stringify(tree.toJSON())).toContain('Resend in 25s');
  });
});

describe('AuthVerify (signup)', () => {
  const props = { ...baseProps, mode: 'signup' as const };

  it('matches snapshot at default props', () => {
    const tree = render(<AuthVerify {...props} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('uses sign-up test IDs and renders the back button', () => {
    const tree = render(<AuthVerify {...props} />);
    expect(tree.root.findByProps({ testID: 'input-signup-otp' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'btn-signup-verify' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'btn-signup-change-number' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'link-signup-resend-code' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'btn-signup-verify-back' })).toBeTruthy();
  });

  it('shows loading state on submit button while isSubmitting', () => {
    const tree = render(<AuthVerify {...props} otp="123456" isSubmitting />);
    const button = tree.root.findByProps({ testID: 'btn-signup-verify' });
    expect(button.props.loading).toBe(true);
    expect(JSON.stringify(tree.toJSON())).toContain('Verifying…');
  });
});
