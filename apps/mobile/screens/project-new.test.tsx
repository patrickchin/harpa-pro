import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { ProjectNew } from './project-new';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('ProjectNew', () => {
  const defaults = {
    isPending: false,
    errorMessage: null,
    onBack: vi.fn(),
    onSubmit: vi.fn(),
  };

  it('matches snapshot at default props', () => {
    const tree = render(<ProjectNew {...defaults} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders error InlineNotice when errorMessage is provided', () => {
    const tree = render(
      <ProjectNew {...defaults} errorMessage="Network unavailable" />,
    );
    expect(JSON.stringify(tree.toJSON())).toContain('Network unavailable');
  });

  it('changes button label to "Creating…" when isPending', () => {
    const tree = render(<ProjectNew {...defaults} isPending />);
    expect(JSON.stringify(tree.toJSON())).toContain('Creating…');
  });

  it('puts the submit button in loading state when isPending', () => {
    const tree = render(<ProjectNew {...defaults} isPending />);
    const button = tree.root.findByProps({ testID: 'btn-submit-project' });
    expect(button.props.loading).toBe(true);
  });

  it('does NOT call onSubmit when the name field is empty (shows validation notice instead)', () => {
    const onSubmit = vi.fn();
    const tree = render(<ProjectNew {...defaults} onSubmit={onSubmit} />);
    const button = tree.root.findByProps({ testID: 'btn-submit-project' });
    act(() => button.props.onPress());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('Project name is required.');
  });

  it('calls onSubmit with trimmed values when name is non-empty', () => {
    const onSubmit = vi.fn();
    const tree = render(<ProjectNew {...defaults} onSubmit={onSubmit} />);
    const nameInput = tree.root.findByProps({ testID: 'input-project-name' });
    const addrInput = tree.root.findByProps({ testID: 'input-project-address' });
    const clientInput = tree.root.findByProps({ testID: 'input-client-name' });
    act(() => {
      nameInput.props.onChangeText('  Highland Tower  ');
      addrInput.props.onChangeText('  2400 Highland Ave  ');
      clientInput.props.onChangeText('  Acme Co.  ');
    });
    const button = tree.root.findByProps({ testID: 'btn-submit-project' });
    act(() => button.props.onPress());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Highland Tower',
      address: '2400 Highland Ave',
      clientName: 'Acme Co.',
    });
  });

  it('coerces empty optional fields to null', () => {
    const onSubmit = vi.fn();
    const tree = render(<ProjectNew {...defaults} onSubmit={onSubmit} />);
    act(() => {
      tree.root.findByProps({ testID: 'input-project-name' }).props.onChangeText('Solo');
    });
    act(() => tree.root.findByProps({ testID: 'btn-submit-project' }).props.onPress());
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Solo',
      address: null,
      clientName: null,
    });
  });

  it('triggers onBack when the header back button fires', () => {
    const onBack = vi.fn();
    const tree = render(<ProjectNew {...defaults} onBack={onBack} />);
    // The ScreenHeader's back affordance — find any Pressable wired to onBack.
    // Easier: drive directly via the ScreenHeader's onBack prop wiring.
    const header = tree.root.findByProps({ title: 'New Project' });
    act(() => header.props.onBack());
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
