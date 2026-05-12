import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { AppDialogSheet } from './AppDialogSheet';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('AppDialogSheet', () => {
  it('renders the dialog when visible with message + actions', () => {
    const tree = render(
      <AppDialogSheet
        visible
        title="Delete Report"
        message="This report will be permanently deleted."
        noticeTitle="Permanent action"
        onClose={() => {}}
        actions={[
          { label: 'Delete', onPress: () => {}, variant: 'destructive', testID: 'btn-delete' },
          { label: 'Cancel', onPress: () => {}, variant: 'secondary', testID: 'btn-cancel' },
        ]}
      />,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('falls back to slot-index keys when no testID provided', () => {
    const tree = render(
      <AppDialogSheet
        visible
        title="Confirm"
        onClose={() => {}}
        actions={[
          { label: 'A', onPress: () => {} },
          { label: 'A', onPress: () => {} },
        ]}
      />,
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('dialog-action-0');
    expect(json).toContain('dialog-action-1');
  });

  it('hides modal content when visible is false', () => {
    const tree = render(
      <AppDialogSheet visible={false} title="Hidden" onClose={() => {}} actions={[]} />,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('renders a close button in the header', () => {
    const onClose = vi.fn();
    const tree = render(
      <AppDialogSheet visible title="Header" onClose={onClose} actions={[]} />,
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('lucide-X');
  });
});
