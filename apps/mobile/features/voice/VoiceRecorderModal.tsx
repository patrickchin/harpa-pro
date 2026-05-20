/**
 * VoiceRecorderModal — Phase C capture UX.
 *
 * Full-screen modal that drives a single recording session and hands
 * the resulting file to the caller via `onCapture`. Decoupled from the
 * upload pipeline: this component knows nothing about the aggregator
 * or queue — Phase D (`useVoiceNotePipeline`) wires the upload + create
 * call on the `onCapture` callback.
 *
 * State machine:
 *   mounted-closed → visible(perm-check) →
 *     • granted   → idle → recording ⇄ paused → stopped → saved
 *                                                      ↘ discarded
 *     • denied    → permission-blocked  (AppDialogSheet, no Alert.alert
 *                   per Pitfall 12 / AGENTS.md hard rule #4)
 *
 * The recorder is injected via the `factory` prop (defaults to
 * `pickRecorderFactory()`) so unit tests drive the fixture backend
 * end-to-end without needing native modules.
 *
 * Refs: docs/v4/arch-voice-pipeline.md §D4 (state machine), §D6 (fixture).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { X } from 'lucide-react-native';

import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { Button } from '@/components/primitives/Button';
import { colors } from '@/lib/design-tokens/colors';
import type {
  PermissionState,
  RecorderFactory,
  RecorderHandle,
  RecorderResult,
  RecorderSnapshot,
} from './recorder-types';
import { pickRecorderFactory } from './pickRecorder';

export interface VoiceRecorderModalProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Called on successful Save with the finalised recording. Phase D
   * wires this to enqueue an upload + call the aggregator. Errors
   * propagated from `onCapture` surface as the failed state, so the
   * user can retry without re-recording.
   */
  onCapture: (result: RecorderResult) => Promise<void> | void;
  /** Test-only injection point. Defaults to `pickRecorderFactory()`. */
  factory?: RecorderFactory;
}

type UiPhase =
  | 'permission-checking'
  | 'permission-blocked'
  | 'ready'
  | 'recording'
  | 'paused'
  | 'saving'
  | 'discard-confirm'
  | 'errored';

const SAVE_LABEL = 'Save voice note';

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceRecorderModal({
  visible,
  onClose,
  onCapture,
  factory,
}: VoiceRecorderModalProps): React.JSX.Element {
  const resolvedFactory = useMemo<RecorderFactory>(
    () => factory ?? pickRecorderFactory(),
    [factory],
  );

  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [phase, setPhase] = useState<UiPhase>('permission-checking');
  const [snap, setSnap] = useState<RecorderSnapshot>({
    status: 'idle',
    durationMs: 0,
    amplitude: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const handleRef = useRef<RecorderHandle | null>(null);

  // Reset + open lifecycle. Each time the modal becomes visible we run
  // a fresh permission check and (if granted) create a fresh handle.
  useEffect(() => {
    let cancelled = false;
    if (!visible) {
      // Cleanup on close.
      handleRef.current?.release();
      handleRef.current = null;
      setPhase('permission-checking');
      setSnap({ status: 'idle', durationMs: 0, amplitude: 0 });
      setError(null);
      return;
    }
    (async () => {
      setPhase('permission-checking');
      const current = await resolvedFactory.getPermission();
      if (cancelled) return;
      let next = current;
      if (current !== 'granted') {
        next = await resolvedFactory.requestPermission();
        if (cancelled) return;
      }
      setPermission(next);
      if (next !== 'granted') {
        setPhase('permission-blocked');
        return;
      }
      const handle = resolvedFactory.create();
      handleRef.current = handle;
      const unsub = handle.subscribe(setSnap);
      // Stash unsubscribe on the handle's release path — simpler than
      // tracking it in a ref.
      const origRelease = handle.release;
      handle.release = () => {
        unsub();
        origRelease();
      };
      setPhase('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, resolvedFactory]);

  async function handleStart() {
    if (!handleRef.current) return;
    setError(null);
    try {
      await handleRef.current.start();
      setPhase('recording');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('errored');
    }
  }

  async function handlePause() {
    if (!handleRef.current) return;
    await handleRef.current.pause();
    setPhase('paused');
  }

  async function handleResume() {
    if (!handleRef.current) return;
    await handleRef.current.resume();
    setPhase('recording');
  }

  async function handleStopAndSave() {
    if (!handleRef.current) return;
    setPhase('saving');
    try {
      const result = await handleRef.current.stop();
      await onCapture(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('errored');
    }
  }

  function requestDiscard() {
    // If nothing recorded yet, just close.
    if (snap.durationMs === 0) {
      void handleRef.current?.cancel();
      onClose();
      return;
    }
    setPhase('discard-confirm');
  }

  async function confirmDiscard() {
    await handleRef.current?.cancel();
    onClose();
  }

  function cancelDiscard() {
    setPhase(snap.status === 'recording' ? 'recording' : 'paused');
  }

  const isRecording = phase === 'recording';
  const isPaused = phase === 'paused';
  const canSave = (isPaused || isRecording) && snap.durationMs > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={requestDiscard}
      testID="voice-recorder-modal"
    >
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
          <Text className="text-xl font-bold text-foreground">Voice note</Text>
          <Pressable
            onPress={requestDiscard}
            hitSlop={12}
            accessibilityLabel="Close voice recorder"
            testID="voice-recorder-close"
          >
            <X size={22} color={colors.muted.foreground} />
          </Pressable>
        </View>

        {/* Body */}
        {phase === 'permission-checking' ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-base text-muted-foreground" testID="voice-recorder-perm-check">
              Checking microphone access…
            </Text>
          </View>
        ) : null}

        {phase === 'permission-blocked' ? (
          <AppDialogSheet
            visible
            title="Microphone access needed"
            message="Enable microphone access in Settings to record voice notes."
            noticeTone="warning"
            onClose={onClose}
            actions={[
              {
                label: 'Close',
                onPress: onClose,
                variant: 'secondary',
                testID: 'voice-recorder-perm-close',
              },
            ]}
          />
        ) : null}

        {phase === 'errored' ? (
          <AppDialogSheet
            visible
            title="Recording failed"
            message={error ?? 'The recorder ran into a problem.'}
            noticeTone="danger"
            onClose={() => setPhase(snap.status === 'recording' ? 'recording' : 'ready')}
            actions={[
              {
                label: 'Dismiss',
                onPress: () => setPhase('ready'),
                variant: 'secondary',
                testID: 'voice-recorder-error-dismiss',
              },
              {
                label: 'Close',
                onPress: onClose,
                variant: 'destructive',
                testID: 'voice-recorder-error-close',
              },
            ]}
          />
        ) : null}

        {phase === 'discard-confirm' ? (
          <AppDialogSheet
            visible
            title="Discard recording?"
            message="This recording will be lost."
            noticeTone="warning"
            onClose={cancelDiscard}
            actions={[
              {
                label: 'Discard',
                onPress: confirmDiscard,
                variant: 'destructive',
                testID: 'voice-recorder-discard-confirm',
              },
              {
                label: 'Keep recording',
                onPress: cancelDiscard,
                variant: 'secondary',
                testID: 'voice-recorder-discard-cancel',
              },
            ]}
          />
        ) : null}

        {(phase === 'ready' || phase === 'recording' || phase === 'paused' || phase === 'saving') &&
        permission === 'granted' ? (
          <View className="flex-1 items-center justify-center gap-8 px-6">
            <Text
              className="text-5xl font-bold tabular-nums text-foreground"
              testID="voice-recorder-duration"
            >
              {formatDuration(snap.durationMs)}
            </Text>

            {/* Amplitude meter — a single bar that grows with |amp|. */}
            <View
              className="h-3 w-64 overflow-hidden rounded-full bg-muted"
              testID="voice-recorder-meter"
            >
              <View
                className="h-full bg-primary"
                style={{ width: `${Math.round(snap.amplitude * 100)}%` }}
              />
            </View>

            <Text className="text-sm text-muted-foreground">
              {isRecording
                ? 'Recording…'
                : isPaused
                  ? 'Paused'
                  : phase === 'saving'
                    ? 'Saving…'
                    : 'Press record to start'}
            </Text>

            <View className="w-full max-w-xs gap-3">
              {phase === 'ready' ? (
                <Button
                  variant="default"
                  size="lg"
                  onPress={handleStart}
                  testID="voice-recorder-start"
                >
                  Record
                </Button>
              ) : null}

              {isRecording ? (
                <Button
                  variant="secondary"
                  size="lg"
                  onPress={handlePause}
                  testID="voice-recorder-pause"
                >
                  Pause
                </Button>
              ) : null}

              {isPaused ? (
                <Button
                  variant="secondary"
                  size="lg"
                  onPress={handleResume}
                  testID="voice-recorder-resume"
                >
                  Resume
                </Button>
              ) : null}

              {canSave ? (
                <Button
                  variant="default"
                  size="lg"
                  onPress={handleStopAndSave}
                  testID="voice-recorder-save"
                >
                  {SAVE_LABEL}
                </Button>
              ) : null}

              {snap.durationMs > 0 ? (
                <Button
                  variant="ghost"
                  size="lg"
                  onPress={requestDiscard}
                  testID="voice-recorder-discard"
                >
                  Discard
                </Button>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
