import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import AuthEmail from './auth-email';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

const baseProps = {
  email: '',
  onChangeEmail: vi.fn(),
  error: null,
  info: null,
  isSubmitting: false,
  onSubmit: vi.fn(),
};

describe('AuthEmail', () => {
  it('matches snapshot at default props', () => {
    const tree = render(<AuthEmail {...baseProps} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('exposes the input-email + btn-login-send-code test IDs', () => {
    const tree = render(<AuthEmail {...baseProps} />);
    expect(tree.root.findByProps({ testID: 'input-email' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'btn-login-send-code' })).toBeTruthy();
  });

  it('renders error notice when error is non-null', () => {
    const tree = render(<AuthEmail {...baseProps} error="Bad email" />);
    const errors = tree.root.findAllByProps({ children: 'Bad email' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('renders info notice when info is non-null', () => {
    const tree = render(<AuthEmail {...baseProps} info="Code sent" />);
    const infos = tree.root.findAllByProps({ children: 'Code sent' });
    expect(infos.length).toBeGreaterThan(0);
  });

  it('disables the submit button while submitting and updates label', () => {
    const tree = render(<AuthEmail {...baseProps} isSubmitting />);
    const btn = tree.root.findByProps({ testID: 'btn-login-send-code' });
    expect(btn.props.disabled).toBe(true);
    const labels = tree.root.findAllByProps({ children: 'Sending Code…' });
    expect(labels.length).toBeGreaterThan(0);
  });
});
