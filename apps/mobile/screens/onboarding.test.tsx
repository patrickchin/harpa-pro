import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import Onboarding from './onboarding';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('Onboarding', () => {
  const defaultProps = {
    fullName: '',
    companyName: '',
    onChangeFullName: vi.fn(),
    onChangeCompanyName: vi.fn(),
    error: null,
    isPending: false,
    onSubmit: vi.fn(),
  };

  it('matches snapshot at default props', () => {
    const tree = render(<Onboarding {...defaultProps} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders both inputs and submit button', () => {
    const tree = render(<Onboarding {...defaultProps} />);
    const nameInput = tree.root.findByProps({ testID: 'input-onboarding-name' });
    const companyInput = tree.root.findByProps({ testID: 'input-onboarding-company' });
    const submitButton = tree.root.findByProps({ testID: 'btn-onboarding-submit' });

    expect(nameInput).toBeTruthy();
    expect(companyInput).toBeTruthy();
    expect(submitButton).toBeTruthy();
  });

  it('renders the welcome subtitle', () => {
    const tree = render(<Onboarding {...defaultProps} />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Finish your account details');
  });

  it('disables inputs when isPending is true', () => {
    const tree = render(<Onboarding {...defaultProps} isPending={true} />);
    const nameInput = tree.root.findByProps({ testID: 'input-onboarding-name' });
    const companyInput = tree.root.findByProps({ testID: 'input-onboarding-company' });

    expect(nameInput.props.editable).toBe(false);
    expect(companyInput.props.editable).toBe(false);
  });

  it('shows Saving... label and loading prop when isPending is true', () => {
    const tree = render(<Onboarding {...defaultProps} isPending={true} />);
    const submitButton = tree.root.findByProps({ testID: 'btn-onboarding-submit' });

    expect(submitButton.props.loading).toBe(true);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Saving...');
  });

  it('renders error InlineNotice when error prop is provided', () => {
    const errorMessage = 'Please enter your full name.';
    const tree = render(<Onboarding {...defaultProps} error={errorMessage} />);

    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain(errorMessage);
  });

  it('calls onSubmit when button is pressed', () => {
    const onSubmit = vi.fn();
    const tree = render(<Onboarding {...defaultProps} onSubmit={onSubmit} />);
    const submitButton = tree.root.findByProps({ testID: 'btn-onboarding-submit' });

    act(() => {
      submitButton.props.onPress();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('calls onChangeFullName when name input changes', () => {
    const onChangeFullName = vi.fn();
    const tree = render(<Onboarding {...defaultProps} onChangeFullName={onChangeFullName} />);
    const nameInput = tree.root.findByProps({ testID: 'input-onboarding-name' });

    act(() => {
      nameInput.props.onChangeText('John Smith');
    });

    expect(onChangeFullName).toHaveBeenCalledWith('John Smith');
  });

  it('calls onChangeCompanyName when company input changes', () => {
    const onChangeCompanyName = vi.fn();
    const tree = render(<Onboarding {...defaultProps} onChangeCompanyName={onChangeCompanyName} />);
    const companyInput = tree.root.findByProps({ testID: 'input-onboarding-company' });

    act(() => {
      companyInput.props.onChangeText('Smith Construction LLC');
    });

    expect(onChangeCompanyName).toHaveBeenCalledWith('Smith Construction LLC');
  });
});
