import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import AuthCode from './auth-code';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

const baseProps = {
  email: 'alice@example.com',
  otp: '',
  onChangeOtp: vi.fn(),
  onChangeEmail: vi.fn(),
  onResend: vi.fn(),
  resendDisabled: false,
  resendCountdownSeconds: null,
  error: null,
  info: null,
  isSubmitting: false,
  onSubmit: vi.fn(),
};

describe('AuthCode', () => {
  it('matches snapshot at default props', () => {
    const tree = render(<AuthCode {...baseProps} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('exposes the input-otp + btn-verify-code + btn-change-email test IDs', () => {
    const tree = render(<AuthCode {...baseProps} />);
    expect(tree.root.findByProps({ testID: 'input-otp' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'btn-verify-code' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'btn-change-email' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'link-resend-code' })).toBeTruthy();
  });

  it('disables verify button until otp has 6 chars', () => {
    const tree = render(<AuthCode {...baseProps} otp="12345" />);
    const btn = tree.root.findByProps({ testID: 'btn-verify-code' });
    expect(btn.props.disabled).toBe(true);
  });

  it('enables verify button at 6 chars', () => {
    const tree = render(<AuthCode {...baseProps} otp="123456" />);
    const btn = tree.root.findByProps({ testID: 'btn-verify-code' });
    expect(btn.props.disabled).toBe(false);
  });

  it('shows countdown when resendCountdownSeconds is set', () => {
    const tree = render(
      <AuthCode {...baseProps} resendDisabled resendCountdownSeconds={42} />,
    );
    const labels = tree.root.findAllByProps({ children: 'Resend in 42s' });
    expect(labels.length).toBeGreaterThan(0);
  });

  it('shows the email in the "Code sent to" line', () => {
    const tree = render(<AuthCode {...baseProps} email="bob@example.com" />);
    // Inline children render as a flat string in RN test renderer when
    // there's no nested element; assert via collected text.
    const all = tree.root.findAllByType('rn-Text' as any);
    const texts = all.flatMap((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.flat(Infinity) : [c];
    });
    expect(texts).toContain('Code sent to bob@example.com');
  });
});
