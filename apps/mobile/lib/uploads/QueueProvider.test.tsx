/**
 * QueueProvider stub tests — assert each method throws.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import React from 'react';
import { Text } from 'react-native';
import { QueueProvider, useUploadQueue } from './QueueProvider';

let tree: ReactTestRenderer | null = null;

function TestConsumer({ onMount }: { onMount: (api: ReturnType<typeof useUploadQueue>) => void }) {
  const api = useUploadQueue();
  React.useEffect(() => {
    onMount(api);
  }, [api, onMount]);
  return <Text>Consumer</Text>;
}

describe('lib/uploads/QueueProvider', () => {
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
        <QueueProvider>
          <Text>Child</Text>
        </QueueProvider>,
      );
    });
    expect(tree!.toJSON()).toMatchSnapshot();
  });

  it('enqueue() throws "not implemented"', () => {
    let api: ReturnType<typeof useUploadQueue> | null = null;
    act(() => {
      tree = create(
        <QueueProvider>
          <TestConsumer onMount={(a) => { api = a; }} />
        </QueueProvider>,
      );
    });

    expect(api).not.toBeNull();
    expect(() => api!.enqueue({ foo: 'bar' })).toThrow('QueueProvider is a stub — upload queue lands in P3');
  });

  it('throws when useUploadQueue is called outside provider', () => {
    expect(() => {
      act(() => {
        tree = create(<TestConsumer onMount={() => {}} />);
      });
    }).toThrow('useUploadQueue must be inside QueueProvider');
  });
});
