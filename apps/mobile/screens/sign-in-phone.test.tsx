import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import SignInPhone from './sign-in-phone';
import { getCountryByCode } from '../lib/countries';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('SignInPhone', () => {
  const defaultProps = {
    country: getCountryByCode('US')!,
    national: '',
    onChangeCountry: vi.fn(),
    onChangeNational: vi.fn(),
    onClear: vi.fn(),
    error: null,
    info: null,
    isSubmitting: false,
    onSubmit: vi.fn(),
  };

  it('matches snapshot at default props', () => {
    const tree = render(<SignInPhone {...defaultProps} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('shows the inline clear button only when the national input has content', () => {
    const treeWithValue = render(
      <SignInPhone {...defaultProps} national="5551234567" />
    );
    const jsonWithValue = JSON.stringify(treeWithValue.toJSON());
    expect(jsonWithValue).toContain('btn-phone-clear');

    const treeEmpty = render(<SignInPhone {...defaultProps} />);
    const jsonEmpty = JSON.stringify(treeEmpty.toJSON());
    expect(jsonEmpty).not.toContain('btn-phone-clear');
  });

  it('invokes onClear when the inline clear button is pressed', () => {
    const onClear = vi.fn();
    const tree = render(
      <SignInPhone {...defaultProps} national="5551234567" onClear={onClear} />
    );
    act(() => {
      tree.root.findByProps({ testID: 'btn-phone-clear' }).props.onPress();
    });
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('disables submit button and changes label while isSubmitting', () => {
    const tree = render(<SignInPhone {...defaultProps} isSubmitting={true} />);
    const button = tree.root.findByProps({ testID: 'btn-login-send-code' });
    expect(button.props.disabled).toBe(true);
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

  it('shows the selected country dial code on the picker button', () => {
    const tree = render(<SignInPhone {...defaultProps} />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('+1');
    expect(json).toContain('btn-country-picker');
  });
});
