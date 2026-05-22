/**
 * GenerateReportInputBar — bottom text-note + voice + photo + attach
 * row. Ported (visual shell) from
 * `../haru3-reports/apps/mobile/components/reports/generate/GenerateReportInputBar.tsx`
 * on branch `dev`.
 *
 * Phase H: tapping the mic now starts the WhatsApp/Telegram-style
 * inline recorder (`useInlineRecorder` lives in the provider). While
 * `voice.isRecording`, the entire row morphs into `InlineVoiceRecorder`
 * — trash on the left, pulsing-dot duration + scrolling waveform in
 * the middle, primary Send on the right. The full-screen
 * `VoiceRecorderModal` is gone.
 */
import { Pressable, Text, TextInput, View } from 'react-native';
import { Camera, Mic, Paperclip, Plus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/primitives/Button';
import { InlineVoiceRecorder } from '@/features/voice/InlineVoiceRecorder';
import { useGenerateReport } from './GenerateReportProvider';
import { colors } from '@/lib/design-tokens/colors';

export function GenerateReportInputBar() {
  const { notes, voice, photo, ui } = useGenerateReport();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="border-t border-border bg-background px-5 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      {voice.isRecording ? (
        <View className="flex-row items-stretch gap-3">
          <InlineVoiceRecorder
            durationMs={voice.snapshot.durationMs}
            historyBars={voice.historyBars}
            onSend={voice.stopAndSend}
            onCancel={voice.cancel}
          />
        </View>
      ) : (
        <View className="flex-row items-stretch gap-3">
          <View
            testID="input-note-container"
            className="min-h-[68px] flex-1 rounded-xl border border-border bg-card px-4 py-3"
          >
            <View className="flex-row items-start gap-2">
              <Pressable
                onPress={() => ui.setAttachmentSheetVisible(true)}
                hitSlop={8}
                testID="btn-attachment"
                accessibilityRole="button"
                accessibilityLabel="Add attachment"
                className="min-h-[44px] items-center justify-center"
              >
                <Paperclip size={20} color={colors.muted.foreground} />
              </Pressable>
              <TextInput
                testID="input-note"
                value={notes.input}
                onChangeText={notes.setInput}
                placeholder="Type a site note..."
                placeholderTextColor={colors.muted.foreground}
                className="min-h-[44px] flex-1 text-base text-foreground"
                multiline
                textAlignVertical="top"
                returnKeyType="default"
                blurOnSubmit={false}
              />
            </View>
          </View>

          {notes.input.trim() ? (
            <Button
              testID="btn-add-note"
              size="lg"
              className="min-h-[68px] min-w-[84px] rounded-xl px-4"
              onPress={notes.add}
            >
              <View className="items-center gap-1">
                <Plus size={18} color={colors.primary.foreground} />
                <Text className="text-xs font-semibold text-primary-foreground">
                  Add
                </Text>
              </View>
            </Button>
          ) : (
            <>
              <Pressable
                onPress={() => void photo.handleCameraCapture()}
                testID="btn-camera-capture"
                accessibilityRole="button"
                accessibilityLabel="Take photo"
              >
                <View className="min-h-[68px] min-w-[68px] items-center justify-center rounded-xl border border-border bg-card px-3">
                  <View className="items-center gap-1">
                    <Camera size={24} color={colors.foreground} />
                    <Text className="text-xs font-semibold text-foreground">
                      Photo
                    </Text>
                  </View>
                </View>
              </Pressable>
              <Pressable
                onPress={voice.start}
                disabled={voice.pipeline === null}
                testID="btn-record-start"
                accessibilityRole="button"
                accessibilityLabel="Start voice recording"
                accessibilityState={{ disabled: voice.pipeline === null }}
              >
                <View
                  className={`min-h-[68px] min-w-[68px] items-center justify-center rounded-xl border border-border bg-card px-3 ${voice.pipeline === null ? 'opacity-50' : ''}`}
                >
                  <View className="items-center gap-1">
                    <Mic size={24} color={colors.foreground} />
                    <Text className="text-xs font-semibold text-foreground">
                      Voice
                    </Text>
                  </View>
                </View>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}
