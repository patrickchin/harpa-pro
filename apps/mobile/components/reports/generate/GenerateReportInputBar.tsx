/**
 * GenerateReportInputBar — bottom text-note + voice + photo + attach
 * row. Ported (visual shell) from
 * `../haru3-reports/apps/mobile/components/reports/generate/GenerateReportInputBar.tsx`
 * on branch `dev`.
 *
 * P3.6 keeps the full icon/button set so the screen visually matches
 * canonical. The voice + photo buttons are wired to provider no-ops
 * (their pipelines land in P3.7); the text input + Add button are
 * fully functional and drive `notes.add()`.
 *
 * The canonical recording UI (pulse animation, LiveWaveform, interim
 * transcript) is deferred — `voice.isRecording` is always false in the
 * stub provider, so the "idle" branch is what renders.
 */
import { Pressable, Text, TextInput, View } from 'react-native';
import { Camera, Mic, Paperclip, Plus } from 'lucide-react-native';

import { Button } from '@/components/primitives/Button';
import { useGenerateReport } from './GenerateReportProvider';
import { colors } from '@/lib/design-tokens/colors';

export function GenerateReportInputBar() {
  const { notes, voice, photo, ui } = useGenerateReport();

  return (
    <View className="border-t border-border bg-background px-5 py-3">
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
              onPress={voice.toggleRecording}
              testID="btn-record-start"
              accessibilityRole="button"
              accessibilityLabel="Start voice recording"
            >
              <View className="min-h-[68px] min-w-[68px] items-center justify-center rounded-xl border border-border bg-card px-3">
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
    </View>
  );
}
