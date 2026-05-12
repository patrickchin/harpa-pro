import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import SignInPhone from './sign-in-phone';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('SignInPhone', () => {
  const defaultProps = {
    phone: '',
    onChangePhone: vi.fn(),
    rememberedPhone: null,
    onUseDifferentNumber: vi.fn(),
    hint: 'Start with + and your country code so we can text your code (e.g. +1 555 123 4567).',
    error: null,
    info: null,
    isSubmitting: false,
    onSubmit: vi.fn(),
  };

  it('matches snapshot at default props', () => {
    const tree = render(<SignInPhone {...defaultProps} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders "Use a different number" only when rememberedPhone is provided', () => {
    const treeWithRemembered = render(
      <SignInPhone {...defaultProps} rememberedPhone="+15551234567" />
    );
    const json = JSON.stringify(treeWithRemembered.toJSON());
    expect(json).toContain('use-different-number');
    expect(json).toContain('Use a different number');

    const treeWithout = render(<SignInPhone {...defaultProps} />);
    const jsonWithout = JSON.stringify(treeWithout.toJSON());
    expect(jsonWithout).not.toContain('use-different-number');
  });

  it('disables submit button and changes label while isSubmitting', () => {
    const tree = render(<SignInPhone {...defaultProps} isSubmitting={true} />);
    const button = tree.root.findByProps({ testID: 'btn-login-send-code' });
    expect(button.props.disabled).toBe(true);
    // Check the JSON contains the submitting text
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Sending Code...');
  });

  it('renders error InlineNotice when error is provided', () => {
    const tree = render(
      <SignInPhone {...defaultProps} error="Invalid phone number format." />
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Invalid phone number format.');
  });

  it('renders info InlineNotice when info is provided', () => {
    const tree = render(
      <SignInPhone {...defaultProps} info="Code sent to your phone." />
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Code sent to your phone.');
  });

  it('renders hint text', () => {
    const tree = render(<SignInPhone {...defaultProps} hint="Custom hint message" />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Custom hint message');
  });
});
