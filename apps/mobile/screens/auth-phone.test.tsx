import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import AuthPhone from './auth-phone';
import { getCountryByCode } from '../lib/countries';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

const baseProps = {
  country: getCountryByCode('US')!,
  national: '',
  onChangeCountry: vi.fn(),
  onChangeNational: vi.fn(),
  error: null,
  isSubmitting: false,
  onSubmit: vi.fn(),
};

describe('AuthPhone (signin)', () => {
  const props = {
    ...baseProps,
    mode: 'signin' as const,
    onClear: vi.fn(),
    info: null,
  };

  it('matches snapshot at default props', () => {
    const tree = render(<AuthPhone {...props} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('uses sign-in test IDs', () => {
    const tree = render(<AuthPhone {...props} />);
    expect(tree.root.findByProps({ testID: 'input-phone' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'btn-login-send-code' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'sign-in-build-badge' })).toBeTruthy();
  });

  it('omits the back button and go-to-sign-in link', () => {
    const tree = render(<AuthPhone {...props} />);
    expect(tree.root.findAllByProps({ testID: 'btn-signup-back' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'link-go-sign-in' })).toHaveLength(0);
  });

  it('shows the info notice when provided', () => {
    const tree = render(<AuthPhone {...props} info="A code is on its way." />);
    expect(JSON.stringify(tree.toJSON())).toContain('A code is on its way.');
  });
});

describe('AuthPhone (signup)', () => {
  const props = {
    ...baseProps,
    mode: 'signup' as const,
    onBack: vi.fn(),
    onGoToSignIn: vi.fn(),
  };

  it('matches snapshot at default props', () => {
    const tree = render(<AuthPhone {...props} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('uses sign-up test IDs and renders the back + go-to-sign-in affordances', () => {
    const tree = render(<AuthPhone {...props} />);
    expect(tree.root.findByProps({ testID: 'input-signup-phone' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'btn-signup-send-code' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'sign-up-build-badge' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'btn-signup-back' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'link-go-sign-in' })).toBeTruthy();
  });

  it('shows "Create Account" title in signup mode', () => {
    const tree = render(<AuthPhone {...props} />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Create Account');
  });
});
