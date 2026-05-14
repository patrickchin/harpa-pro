import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { ProjectEdit } from './project-edit';

function render(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(el);
  });
  return tree;
}

const defaults = {
  initial: { name: 'Highland Tower', clientName: 'Acme Co.', address: '2400 Highland Ave' },
  isLoading: false,
  isUpdating: false,
  isDeleting: false,
  updateError: null,
  deleteError: null,
  onBack: vi.fn(),
  onSubmit: vi.fn(),
  onDelete: vi.fn(),
};

describe('ProjectEdit', () => {
  it('renders skeleton when isLoading', () => {
    const tree = render(<ProjectEdit {...defaults} isLoading />);
    expect(tree.root.findAllByProps({ testID: 'input-edit-project-name' })).toHaveLength(0);
  });

  it('seeds inputs from initial values', () => {
    const tree = render(<ProjectEdit {...defaults} />);
    const nameInput = tree.root.findByProps({ testID: 'input-edit-project-name' });
    expect(nameInput.props.value).toBe('Highland Tower');
  });

  it('does NOT call onSubmit when name is cleared', () => {
    const onSubmit = vi.fn();
    const tree = render(<ProjectEdit {...defaults} onSubmit={onSubmit} />);
    act(() => {
      tree.root.findByProps({ testID: 'input-edit-project-name' }).props.onChangeText('');
    });
    act(() => tree.root.findByProps({ testID: 'btn-save-project' }).props.onPress());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('Project name is required.');
  });

  it('calls onSubmit with trimmed values and null for cleared optionals', () => {
    const onSubmit = vi.fn();
    const tree = render(<ProjectEdit {...defaults} onSubmit={onSubmit} />);
    act(() => {
      tree.root.findByProps({ testID: 'input-edit-project-name' }).props.onChangeText('  New Name  ');
      tree.root.findByProps({ testID: 'input-edit-project-address' }).props.onChangeText('  ');
      tree.root.findByProps({ testID: 'input-edit-client-name' }).props.onChangeText('  Bob  ');
    });
    act(() => tree.root.findByProps({ testID: 'btn-save-project' }).props.onPress());
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'New Name',
      address: null,
      clientName: 'Bob',
    });
  });

  it('puts the save button in loading state while updating', () => {
    const tree = render(<ProjectEdit {...defaults} isUpdating />);
    expect(tree.root.findByProps({ testID: 'btn-save-project' }).props.loading).toBe(true);
  });

  it('shows updateError inline when provided', () => {
    const tree = render(
      <ProjectEdit {...defaults} updateError="Server exploded" />,
    );
    expect(JSON.stringify(tree.toJSON())).toContain('Server exploded');
  });

  it('opens delete confirmation dialog when delete button pressed', () => {
    const tree = render(<ProjectEdit {...defaults} />);
    act(() => tree.root.findByProps({ testID: 'btn-delete-project' }).props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain('Delete Project');
  });
});
