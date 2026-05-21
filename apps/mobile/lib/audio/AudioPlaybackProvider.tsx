/**
 * AudioPlaybackProvider — Phase D real implementation.
 *
 * Owns a single global `expo-audio` player so only one voice note is
 * playing at a time (per `docs/v4/arch-voice-pipeline.md §D7`). When a
 * second `play(uri)` arrives, the previous player is `pause()`d and
 * `release()`d before a fresh one is created.
 *
 * The provider takes a `playerFactory` so the node-only vitest env can
 * swap in a fake without loading the native module. Default factory
 * (`defaultPlayerFactory`) calls `createAudioPlayer` from `expo-audio`
 * directly — exercised by the integration test via the real path
 * (Pitfall 13).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { beginPlayback, endPlayback } from './audioSession';

export interface PlaybackPlayer {
  play(): void;
  pause(): void;
  /** Position in seconds. */
  readonly currentTime: number;
  /** Total duration in seconds (may be 0 before metadata loads). */
  readonly duration: number;
  /** True between `play()` and `pause()`/finish. */
  readonly playing: boolean;
  seekTo(seconds: number): Promise<void>;
  /** Release native resources. Idempotent. */
  remove(): void;
}

export type PlayerFactory = (uri: string) => PlaybackPlayer;

function defaultPlayerFactory(uri: string): PlaybackPlayer {
  // Lazy require so node-only tests that don't exercise playback never
  // pay the cost of loading the native module.
  const { createAudioPlayer } = require('expo-audio') as typeof import('expo-audio');
  return createAudioPlayer(uri) as unknown as PlaybackPlayer;
}

export interface PlaybackStatus {
  /** Source URI of the currently-loaded note, or `null` when idle. */
  uri: string | null;
  /** True while the player is in the playing state. */
  playing: boolean;
  /** Position in seconds (polled from the active player). */
  positionSec: number;
  /** Total duration in seconds (0 until the player reports it). */
  durationSec: number;
}

export interface AudioPlaybackContextValue {
  /**
   * Start playback of the given URI. If a different URI is already
   * playing, that player is released first. Calling `play(sameUri)`
   * while paused resumes; calling while already playing is a no-op.
   */
  play: (uri: string) => Promise<void>;
  /** Pause without releasing. `resume()` (calling `play(sameUri)`) restarts. */
  pause: () => void;
  /** Pause + release the active player. */
  stop: () => void;
  /** Jump within the currently-loaded note. No-op when idle. */
  seek: (seconds: number) => Promise<void>;
  /** Live status snapshot. Updated on a 250 ms tick while playing. */
  status: PlaybackStatus;
}

const AudioPlaybackContext = createContext<AudioPlaybackContextValue | null>(
  null,
);

const IDLE_STATUS: PlaybackStatus = {
  uri: null,
  playing: false,
  positionSec: 0,
  durationSec: 0,
};

export interface AudioPlaybackProviderProps {
  children: ReactNode;
  /** Test seam. Defaults to `defaultPlayerFactory` (real expo-audio). */
  playerFactory?: PlayerFactory;
}

export function AudioPlaybackProvider({
  children,
  playerFactory = defaultPlayerFactory,
}: AudioPlaybackProviderProps) {
  const playerRef = useRef<PlaybackPlayer | null>(null);
  const uriRef = useRef<string | null>(null);
  // Tracks whether we currently hold the iOS playback audio session.
  // `beginPlayback()` is called when playback transitions from
  // not-playing → playing; `endPlayback()` when it goes the other
  // way (user pause, stop, natural end, unmount). Refcounted in
  // `audioSession.ts`, but we still must avoid double-begin/end
  // from one logical player.
  const sessionHeldRef = useRef<boolean>(false);
  const [status, setStatus] = useState<PlaybackStatus>(IDLE_STATUS);

  const acquireSession = useCallback(() => {
    if (sessionHeldRef.current) return;
    sessionHeldRef.current = true;
    void beginPlayback();
  }, []);
  const releaseSession = useCallback(() => {
    if (!sessionHeldRef.current) return;
    sessionHeldRef.current = false;
    void endPlayback();
  }, []);

  // Poll the active player so the UI can render position + duration.
  // We keep polling while we have an attached player (not just while
  // `status.playing` is true) so the UI can detect natural end-of-
  // playback and flip the button back to Play without the caller
  // having to wire up an event listener. The same poll detects the
  // natural-end transition and releases the audio session so any
  // background music can resume.
  useEffect(() => {
    if (!status.uri) return;
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const playing = p.playing;
      const pos = p.currentTime;
      const dur = p.duration;
      // Natural end: player no longer playing, parked at duration.
      // Release the audio session (notifies music apps to resume).
      if (!playing && dur > 0 && pos >= dur - 0.25 && sessionHeldRef.current) {
        releaseSession();
      }
      setStatus((prev) => {
        if (
          prev.playing === playing &&
          prev.positionSec === pos &&
          prev.durationSec === dur
        ) {
          return prev;
        }
        return { uri: uriRef.current, playing, positionSec: pos, durationSec: dur };
      });
    }, 250);
    return () => clearInterval(id);
  }, [status.uri, releaseSession]);

  // Tear down on unmount so we never leak native players across app
  // backgrounding / hot reloads.
  useEffect(
    () => () => {
      playerRef.current?.remove();
      playerRef.current = null;
      uriRef.current = null;
      if (sessionHeldRef.current) {
        sessionHeldRef.current = false;
        void endPlayback();
      }
    },
    [],
  );

  const releaseActive = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
      } catch {
        // Pausing a finished/released player is fine.
      }
      try {
        playerRef.current.remove();
      } catch {
        // remove is idempotent on iOS; Android may throw on double-call.
      }
      playerRef.current = null;
    }
    uriRef.current = null;
    releaseSession();
  }, [releaseSession]);

  const play = useCallback(
    async (uri: string) => {
      // Same URI + paused → resume on the same player. Same URI +
      // already playing → no-op so spurious taps don't restart from 0.
      if (uriRef.current === uri && playerRef.current) {
        const p = playerRef.current;
        if (p.playing) return;
        // expo-audio leaves `currentTime === duration` after a track
        // finishes naturally. Calling `play()` in that state resumes
        // at the end and immediately finishes again — visible as a
        // "play button does nothing after the track ended" bug.
        // Seek back to 0 first so a second tap is treated as replay.
        const dur = p.duration;
        const pos = p.currentTime;
        if (dur > 0 && pos >= dur - 0.25) {
          try {
            await p.seekTo(0);
          } catch {
            // Some player implementations reject seekTo after end —
            // fall through and let the platform handle it.
          }
        }
        acquireSession();
        p.play();
        setStatus({
          uri,
          playing: true,
          positionSec: p.currentTime,
          durationSec: p.duration,
        });
        return;
      }

      releaseActive();
      acquireSession();
      const next = playerFactory(uri);
      playerRef.current = next;
      uriRef.current = uri;
      next.play();
      setStatus({
        uri,
        playing: true,
        positionSec: next.currentTime,
        durationSec: next.duration,
      });
    },
    [playerFactory, releaseActive, acquireSession],
  );

  const pause = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    p.pause();
    releaseSession();
    setStatus({
      uri: uriRef.current,
      playing: false,
      positionSec: p.currentTime,
      durationSec: p.duration,
    });
  }, [releaseSession]);

  const stop = useCallback(() => {
    releaseActive();
    setStatus(IDLE_STATUS);
  }, [releaseActive]);

  const seek = useCallback(async (seconds: number) => {
    const p = playerRef.current;
    if (!p) return;
    await p.seekTo(seconds);
    setStatus({
      uri: uriRef.current,
      playing: p.playing,
      positionSec: p.currentTime,
      durationSec: p.duration,
    });
  }, []);

  const value = useMemo<AudioPlaybackContextValue>(
    () => ({ play, pause, stop, seek, status }),
    [play, pause, stop, seek, status],
  );

  return (
    <AudioPlaybackContext.Provider value={value}>
      {children}
    </AudioPlaybackContext.Provider>
  );
}

export function useAudioPlayback(): AudioPlaybackContextValue {
  const ctx = useContext(AudioPlaybackContext);
  if (!ctx)
    throw new Error('useAudioPlayback must be inside AudioPlaybackProvider');
  return ctx;
}
