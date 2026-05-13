/**
 * AudioPlaybackProvider stub — playback lands in P3.
 *
 * Security review §2 mandates: pause() and stop() MUST throw (not just play()).
 * Stubs deliberately surface wiring bugs in P3.
 */
import { createContext, useContext, type ReactNode } from 'react';

export interface AudioPlaybackContextValue {
  play: (storagePath: string) => Promise<void>;
  pause: () => void;
  stop: () => void;
}

const AudioPlaybackContext = createContext<AudioPlaybackContextValue | null>(null);

export function AudioPlaybackProvider({ children }: { children: ReactNode }) {
  const play = async () => {
    throw new Error('AudioPlaybackProvider is a stub — playback lands in P3');
  };
  const pause = () => {
    throw new Error('AudioPlaybackProvider is a stub — playback lands in P3');
  };
  const stop = () => {
    throw new Error('AudioPlaybackProvider is a stub — playback lands in P3');
  };
  return (
    <AudioPlaybackContext.Provider value={{ play, pause, stop }}>
      {children}
    </AudioPlaybackContext.Provider>
  );
}

export function useAudioPlayback() {
  const ctx = useContext(AudioPlaybackContext);
  if (!ctx) throw new Error('useAudioPlayback must be inside AudioPlaybackProvider');
  return ctx;
}
