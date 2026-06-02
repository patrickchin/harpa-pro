/**
 * Component test for EditSectionSheet — the generic full-screen modal
 * shell. Verifies:
 *   - Save is disabled when the draft is clean
 *   - Save fires onSave with the current draft
 *   - Clean Cancel calls onCancel directly
 *   - Dirty Cancel opens the discard-confirm sheet
 */
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';

import { EditSectionSheet } from './EditSectionSheet';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

interface Draft {
  title: string;
}

function renderSheet(overrides: Partial<{
  initialValue: Draft;
  onSave: (next: Draft) => void;
  onCancel: () => void;
  onDelete: () => void;
}> = {}) {
  const initialValue = overrides.initialValue ?? { title: 'Hello' };
  const onSave = overrides.onSave ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();
  const onDelete = overrides.onDelete;
  const tree = render(
    <EditSectionSheet<Draft>
      visible
      title="Edit"
      initialValue={initialValue}
      onSave={onSave}
      onCancel={onCancel}
      {...(onDelete ? { onDelete } : {})}
    >
      {(draft, setDraft) => (
        <TextInput
          testID="draft-input"
          value={draft.title}
          onChangeText={(t) => setDraft({ ...draft, title: t })}
        />
      )}
    </EditSectionSheet>,
  );
  return { tree, onSave, onCancel, onDelete };
}

describe('EditSectionSheet', () => {
  it('disables Save when the draft is clean', () => {
    const { tree } = renderSheet();
    const save = tree.root.findByProps({ testID: 'btn-edit-modal-save' });
    expect(save.props.disabled).toBe(true);
  });

  it('calls onCancel directly when the draft is clean', () => {
    const { tree, onCancel } = renderSheet();
    act(() => {
      tree.root
        .findByProps({ testID: 'btn-edit-modal-cancel' })
        .props.onPress();
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('enables Save and fires onSave with the new draft after editing', () => {
    const { tree, onSave } = renderSheet();
    act(() => {
      tree.root
        .findByProps({ testID: 'draft-input' })
        .props.onChangeText('Updated');
    });
    const save = tree.root.findByProps({ testID: 'btn-edit-modal-save' });
    expect(save.props.disabled).toBe(false);
    act(() => {
      save.props.onPress();
    });
    expect(onSave).toHaveBeenCalledWith({ title: 'Updated' });
  });

  it('opens the discard-confirm dialog when cancelling a dirty draft', () => {
    const { tree, onCancel } = renderSheet();
    act(() => {
      tree.root
        .findByProps({ testID: 'draft-input' })
        .props.onChangeText('Updated');
    });
    act(() => {
      tree.root
        .findByProps({ testID: 'btn-edit-modal-cancel' })
        .props.onPress();
    });
    // Cancel does NOT call onCancel directly; the dialog handles it.
    expect(onCancel).not.toHaveBeenCalled();
    // Confirm button on the dialog is mounted.
    expect(
      tree.root.findAllByProps({ testID: 'btn-edit-modal-discard-confirm' })
        .length,
    ).toBeGreaterThan(0);
  });

  it('renders a Delete button only when onDelete is provided', () => {
    const { tree: withDelete } = renderSheet({ onDelete: vi.fn() });
    expect(
      withDelete.root.findAllByProps({ testID: 'btn-edit-modal-delete' })
        .length,
    ).toBeGreaterThan(0);

    const { tree: withoutDelete } = renderSheet();
    expect(
      withoutDelete.root.findAllByProps({ testID: 'btn-edit-modal-delete' }),
    ).toHaveLength(0);
  });

  it('renders the body content', () => {
    const { tree } = renderSheet();
    const input = tree.root.findByProps({ testID: 'draft-input' });
    expect(input.props.value).toBe('Hello');
    // Suppress unused-import warning for Text by referencing it.
    void Text;
  });
});
