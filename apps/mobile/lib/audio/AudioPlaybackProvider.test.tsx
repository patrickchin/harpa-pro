/**
 * AudioPlaybackProvider stub tests — assert all methods throw.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import React from 'react';
import { Text } from 'react-native';
import { AudioPlaybackProvider, useAudioPlayback } from './AudioPlaybackProvider';

let tree: ReactTestRenderer | null = null;

function TestConsumer({ onMount }: { onMount: (api: ReturnType<typeof useAudioPlayback>) => void }) {
  const api = useAudioPlayback();
  React.useEffect(() => {
    onMount(api);
  }, [api, onMount]);
  return <Text>Consumer</Text>;
}

describe('lib/audio/AudioPlaybackProvider', () => {
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
        <AudioPlaybackProvider>
          <Text>Child</Text>
        </AudioPlaybackProvider>,
      );
    });
    expect(tree!.toJSON()).toMatchSnapshot();
  });

  it('play() rejects with "not implemented"', async () => {
    let api: ReturnType<typeof useAudioPlayback> | null = null;
    act(() => {
      tree = create(
        <AudioPlaybackProvider>
          <TestConsumer onMount={(a) => { api = a; }} />
        </AudioPlaybackProvider>,
      );
    });

    expect(api).not.toBeNull();
    await expect(api!.play('path/to/audio.mp3')).rejects.toThrow('AudioPlaybackProvider is a stub — playback lands in P3');
  });

  it('pause() throws "not implemented"', () => {
    let api: ReturnType<typeof useAudioPlayback> | null = null;
    act(() => {
      tree = create(
        <AudioPlaybackProvider>
          <TestConsumer onMount={(a) => { api = a; }} />
        </AudioPlaybackProvider>,
      );
    });

    expect(api).not.toBeNull();
    expect(() => api!.pause()).toThrow('AudioPlaybackProvider is a stub — playback lands in P3');
  });

  it('stop() throws "not implemented"', () => {
    let api: ReturnType<typeof useAudioPlayback> | null = null;
    act(() => {
      tree = create(
        <AudioPlaybackProvider>
          <TestConsumer onMount={(a) => { api = a; }} />
        </AudioPlaybackProvider>,
      );
    });

    expect(api).not.toBeNull();
    expect(() => api!.stop()).toThrow('AudioPlaybackProvider is a stub — playback lands in P3');
  });

  it('throws when useAudioPlayback is called outside provider', () => {
    expect(() => {
      act(() => {
        tree = create(<TestConsumer onMount={() => {}} />);
      });
    }).toThrow('useAudioPlayback must be inside AudioPlaybackProvider');
  });
});
