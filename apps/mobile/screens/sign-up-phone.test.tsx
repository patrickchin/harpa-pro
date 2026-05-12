import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import SignUpPhone from './sign-up-phone';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('SignUpPhone', () => {
  const defaultProps = {
    phone: '',
    onChangePhone: vi.fn(),
    onBack: vi.fn(),
    onGoToSignIn: vi.fn(),
    error: null,
    isSubmitting: false,
    onSubmit: vi.fn(),
  };

  it('matches snapshot at default props', () => {
    const tree = render(<SignUpPhone {...defaultProps} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders error InlineNotice when error provided', () => {
    const tree = render(
      <SignUpPhone {...defaultProps} error="Invalid phone number" />
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Invalid phone number');
  });

  it('changes button label to "Sending Code…" when isSubmitting', () => {
    const tree = render(<SignUpPhone {...defaultProps} isSubmitting={true} />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Sending Code…');
  });

  it('disables button when isSubmitting', () => {
    const tree = render(<SignUpPhone {...defaultProps} isSubmitting={true} />);
    const button = tree.root.findByProps({ testID: 'btn-signup-send-code' });
    expect(button.props.loading).toBe(true);
  });

  it('triggers onBack when back arrow is pressed', () => {
    const onBack = vi.fn();
    const tree = render(<SignUpPhone {...defaultProps} onBack={onBack} />);
    const backButton = tree.root.findByProps({ testID: 'btn-signup-back' });

    act(() => {
      backButton.props.onPress();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('triggers onGoToSignIn when footer "Sign In" link is pressed', () => {
    const onGoToSignIn = vi.fn();
    const tree = render(<SignUpPhone {...defaultProps} onGoToSignIn={onGoToSignIn} />);
    const signInLink = tree.root.findByProps({ testID: 'link-go-sign-in' });

    act(() => {
      signInLink.props.onPress();
    });

    expect(onGoToSignIn).toHaveBeenCalledTimes(1);
  });
});
