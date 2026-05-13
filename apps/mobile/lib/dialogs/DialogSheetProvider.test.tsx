/**
 * DialogSheetProvider tests — imperative dialog API with confirm vs alert
 * semantics. Security review §1 P1 mandates:
 *   - confirm() resolves boolean (true on first action, false on second)
 *   - alert() resolves void (single action, no boolean return)
 *
 * Uses a simplified approach: call the API and then immediately trigger
 * the action handlers by finding the rendered buttons in the tree.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import React from 'react';
import { Text, View } from 'react-native';
import { DialogSheetProvider, useAppDialogSheet } from './DialogSheetProvider';
import { Button } from '@/components/primitives/Button';
import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';

let tree: ReactTestRenderer | null = null;

function TestConsumer({ onMount }: { onMount: (api: ReturnType<typeof useAppDialogSheet>) => void }) {
  const api = useAppDialogSheet();
  React.useEffect(() => {
    onMount(api);
  }, [api, onMount]);
  return <Text>Consumer</Text>;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('lib/dialogs/DialogSheetProvider', () => {
  afterEach(() => {
    if (tree) {
      act(() => {
        tree!.unmount();
      });
      tree = null;
    }
  });

  it('renders children without crashing', () => {
    act(() => {
      tree = create(
        <DialogSheetProvider>
          <View />
        </DialogSheetProvider>,
      );
    });
    expect(tree!.toJSON()).toMatchSnapshot();
  });

  it('confirm() resolves true when first action is pressed', async () => {
    let api: ReturnType<typeof useAppDialogSheet> | null = null;
    act(() => {
      tree = create(
        <DialogSheetProvider>
          <TestConsumer onMount={(a) => { api = a; }} />
        </DialogSheetProvider>,
      );
    });

    expect(api).not.toBeNull();
    
    let resolvedValue: boolean | undefined;
    const promise = api!.confirm({ 
      title: 'Delete?', 
      message: 'This is permanent',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    }).then(v => { resolvedValue = v; });
    
    // Wait for the dialog to render
    await flush();
    
    // Find all Button components (from AppDialogSheet)
    const buttons = tree!.root.findAllByType(Button);
    expect(buttons.length).toBe(2); // Confirm + Cancel
    
    // Press the first button (Confirm)
    act(() => {
      buttons[0]!.props.onPress();
    });
    
    await promise;
    expect(resolvedValue).toBe(true);
  });

  it('confirm() resolves false when second action is pressed', async () => {
    let api: ReturnType<typeof useAppDialogSheet> | null = null;
    act(() => {
      tree = create(
        <DialogSheetProvider>
          <TestConsumer onMount={(a) => { api = a; }} />
        </DialogSheetProvider>,
      );
    });

    expect(api).not.toBeNull();
    
    let resolvedValue: boolean | undefined;
    const promise = api!.confirm({ 
      title: 'Delete?', 
      message: 'This is permanent',
    }).then(v => { resolvedValue = v; });
    
    await flush();
    
    const buttons = tree!.root.findAllByType(Button);
    expect(buttons.length).toBe(2);
    
    // Press the second button (Cancel)
    act(() => {
      buttons[1]!.props.onPress();
    });
    
    await promise;
    expect(resolvedValue).toBe(false);
  });

  it('alert() resolves void on dismiss', async () => {
    let api: ReturnType<typeof useAppDialogSheet> | null = null;
    act(() => {
      tree = create(
        <DialogSheetProvider>
          <TestConsumer onMount={(a) => { api = a; }} />
        </DialogSheetProvider>,
      );
    });

    expect(api).not.toBeNull();
    
    let resolvedValue: void | undefined;
    let resolved = false;
    const promise = api!.alert({ 
      title: 'Notice', 
      message: 'Something happened',
    }).then(v => { 
      resolvedValue = v;
      resolved = true;
    });
    
    await flush();
    
    const buttons = tree!.root.findAllByType(Button);
    expect(buttons.length).toBe(1); // Single OK button
    
    // Press the OK button
    act(() => {
      buttons[0]!.props.onPress();
    });
    
    await promise;
    expect(resolved).toBe(true);
    expect(resolvedValue).toBeUndefined();
  });

  it('confirm() resolves false on backdrop dismiss', async () => {
    let api: ReturnType<typeof useAppDialogSheet> | null = null;
    act(() => {
      tree = create(
        <DialogSheetProvider>
          <TestConsumer onMount={(a) => { api = a; }} />
        </DialogSheetProvider>,
      );
    });

    expect(api).not.toBeNull();
    
    let resolvedValue: boolean | undefined;
    const promise = api!.confirm({ 
      title: 'Delete?',
      message: 'This is permanent',
    }).then(v => { resolvedValue = v; });
    
    await flush();
    
    // Find the AppDialogSheet and call its onClose
    const sheet = tree!.root.findByType(AppDialogSheet);
    act(() => {
      sheet.props.onClose();
    });
    
    await promise;
    expect(resolvedValue).toBe(false);
  });

  it('alert() resolves void on backdrop dismiss', async () => {
    let api: ReturnType<typeof useAppDialogSheet> | null = null;
    act(() => {
      tree = create(
        <DialogSheetProvider>
          <TestConsumer onMount={(a) => { api = a; }} />
        </DialogSheetProvider>,
      );
    });

    expect(api).not.toBeNull();
    
    let resolved = false;
    const promise = api!.alert({ 
      title: 'Notice',
      message: 'Something happened',
    }).then(() => { 
      resolved = true;
    });
    
    await flush();
    
    const sheet = tree!.root.findByType(AppDialogSheet);
    act(() => {
      sheet.props.onClose();
    });
    
    await promise;
    expect(resolved).toBe(true);
  });

  it('throws when useAppDialogSheet is called outside provider', () => {
    expect(() => {
      act(() => {
        tree = create(<TestConsumer onMount={() => {}} />);
      });
    }).toThrow('useAppDialogSheet must be inside DialogSheetProvider');
  });
});
