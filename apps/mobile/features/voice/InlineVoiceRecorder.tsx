/**
 * `InlineVoiceRecorder` — Phase H WhatsApp / Telegram-style inline
 * recording strip rendered by `GenerateReportInputBar` while
 * `voice.isRecording` is true.
 *
 * Layout (single row, ~68px tall to match the input bar):
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ [🗑]  ● 0:08         ▁▂▅▇▆▃▁▂▄▆▇▅▃▁▂▄▆ …  [Send ▶]           │
 *   │       Max 15:00                                              │
 *   └─────────────────────────────────────────────────────────────┘
 *
 *   • Trash button (destructive ghost) — cancels and discards local audio.
 *   • Pulsing red dot + monospaced duration counter, with a "Max 15:00"
 *     hint underneath. Counter turns destructive past WARNING_DURATION_MS
 *     (10 min) so the user can wrap up before the 15 min hard stop.
 *   • Scrolling waveform — last N amplitude samples rendered as bars.
 *   • Primary Send button — stops, finalises, hands result to onSend.
 *   • Auto-send: when `durationMs >= MAX_DURATION_MS` we fire `onSend`
 *     once. 15 min × 32 kbps AAC ≈ 3.5 MB — comfortably under the 25 MB
 *     server cap (`packages/api/src/routes/voice.ts`) and Groq Whisper's
 *     25 MB free-tier ceiling. See `docs/v4/arch-voice-pipeline.md` §D5.
 *
 * Pure presentational. State is owned by `useInlineRecorder` (provider).
 * Errors and the permission gate are rendered by the provider as
 * `AppDialogSheet`s so this component stays bounded to the row UI.
 *
 * Refs: docs/v4/arch-voice-pipeline.md §D5.
 */
import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Send, Trash2 } from 'lucide-react-native';

import { colors } from '@/lib/design-tokens/colors';
import { HISTORY_SIZE } from './useInlineRecorder';

export interface InlineVoiceRecorderProps {
  durationMs: number;
  historyBars: readonly number[];
  onSend: () => void;
  onCancel: () => void;
  /** Disables Send while the underlying pipeline is finalising. */
  sending?: boolean;
}

const BAR_MIN_HEIGHT = 4;
const BAR_MAX_HEIGHT = 32;
const BAR_WIDTH = 3;
const BAR_GAP = 2;

/**
 * Hard cap on a single recording. At 32 kbps mono AAC this is ≈ 3.5 MB,
 * keeping us well under Groq Whisper's 25 MB free-tier limit and our
 * own 25 MB server cap. Cap is enforced client-side; the server still
 * 413s on file size as a defence in depth (see HARPA-PRO-D postmortem).
 */
export const MAX_DURATION_MS = 15 * 60 * 1000;
/** Soft warning: counter turns destructive 5 min before the hard stop. */
export const WARNING_DURATION_MS = 10 * 60 * 1000;

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Pulsing red dot — uses `Animated.loop` rather than CSS so a single
 * animation node drives the rendered opacity (works under RN's native
 * driver, no per-frame JS bridge traffic).
 */
function RecordingDot() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      testID="voice-record-dot"
      style={{
        opacity,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: colors.destructive.DEFAULT,
      }}
    />
  );
}

const SPRING_CONFIG = {
  damping: 18,
  stiffness: 220,
  mass: 0.5,
  overshootClamping: true,
} as const;

/**
 * Single animated bar. `useSharedValue` + `useAnimatedStyle` run on the
 * UI thread via Reanimated, so height transitions are always 60 fps even
 * when the JS thread is busy.
 */
function WaveformBar({ targetHeight, hasSignal }: { targetHeight: number; hasSignal: boolean }) {
  const animHeight = useSharedValue(BAR_MIN_HEIGHT);

  useEffect(() => {
    animHeight.value = withSpring(targetHeight, SPRING_CONFIG);
  }, [animHeight, targetHeight]);

  const animStyle = useAnimatedStyle(() => ({
    height: animHeight.value,
  }));

  return (
    <Reanimated.View
      style={[
        {
          width: BAR_WIDTH,
          borderRadius: BAR_WIDTH / 2,
          backgroundColor: hasSignal ? colors.primary.DEFAULT : colors.muted.DEFAULT,
        },
        animStyle,
      ]}
    />
  );
}

/**
 * Right-anchored scrolling waveform. We render exactly HISTORY_SIZE
 * bars (padding empty slots on the left while the buffer fills) so
 * the layout doesn't reflow as samples arrive. Each bar animates its
 * height independently via Reanimated for smooth 60 fps transitions.
 */
function Waveform({ bars }: { bars: readonly number[] }) {
  const padded: readonly number[] = bars.length >= HISTORY_SIZE
    ? bars.slice(bars.length - HISTORY_SIZE)
    : [...new Array(HISTORY_SIZE - bars.length).fill(0), ...bars];
  return (
    <View
      testID="voice-record-waveform"
      className="h-10 flex-1 flex-row items-center justify-end"
      style={{ gap: BAR_GAP }}
    >
      {padded.map((amp, idx) => {
        const h = Math.max(BAR_MIN_HEIGHT, amp * BAR_MAX_HEIGHT);
        return (
          <WaveformBar key={idx} targetHeight={h} hasSignal={amp > 0} />
        );
      })}
    </View>
  );
}

export function InlineVoiceRecorder({
  durationMs,
  historyBars,
  onSend,
  onCancel,
  sending = false,
}: InlineVoiceRecorderProps): React.JSX.Element {
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (autoSentRef.current) return;
    if (sending) return;
    if (durationMs >= MAX_DURATION_MS) {
      autoSentRef.current = true;
      onSend();
    }
  }, [durationMs, sending, onSend]);

  const isWarning = durationMs >= WARNING_DURATION_MS;
  return (
    <View
      testID="voice-record-strip"
      accessibilityLabel="Recording voice note"
      className="min-h-[68px] flex-1 flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
    >
      <Pressable
        onPress={onCancel}
        disabled={sending}
        testID="btn-record-cancel"
        accessibilityRole="button"
        accessibilityLabel="Cancel recording"
        hitSlop={8}
        className="h-11 w-11 items-center justify-center rounded-full"
      >
        <Trash2 size={20} color={colors.destructive.DEFAULT} />
      </Pressable>

      <View className="flex-row items-center gap-2">
        <RecordingDot />
        <View>
          <Text
            testID="voice-record-duration"
            className={`min-w-[36px] text-base font-semibold tabular-nums ${
              isWarning ? 'text-destructive' : 'text-foreground'
            }`}
          >
            {formatDuration(durationMs)}
          </Text>
          <Text
            testID="voice-record-max"
            className="text-[10px] text-muted-foreground"
          >
            Max {formatDuration(MAX_DURATION_MS)}
          </Text>
        </View>
      </View>

      <Waveform bars={historyBars} />

      <Pressable
        onPress={onSend}
        disabled={sending || durationMs === 0}
        testID="btn-record-send"
        accessibilityRole="button"
        accessibilityLabel="Send voice note"
        accessibilityState={{ disabled: sending || durationMs === 0 }}
        hitSlop={8}
        className={`h-11 w-11 items-center justify-center rounded-full bg-primary ${
          sending || durationMs === 0 ? 'opacity-50' : ''
        }`}
      >
        <Send size={18} color={colors.primary.foreground} />
      </Pressable>
    </View>
  );
}
