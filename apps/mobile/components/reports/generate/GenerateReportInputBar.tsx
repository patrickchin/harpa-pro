/**
 * GenerateReportInputBar — a compact capture pill for attachment, text,
 * photo, and voice. Selecting a mode swaps the pill's contents while the
 * existing capture handlers and bottom safe-area treatment stay unchanged.
 */
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Camera, Mic, Paperclip, Pencil, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/primitives/Button';
import { InlineVoiceRecorder } from '@/features/voice/InlineVoiceRecorder';
import { useGenerateReport } from '@/features/generate/GenerateReportProvider';
import { colors } from '@/lib/design-tokens/colors';
import { getSurfaceDepthStyle } from '@/lib/reports/surface-depth';

export function GenerateReportInputBar() {
  const { notes, voice, photo, ui } = useGenerateReport();
  const insets = useSafeAreaInsets();
  const [isTextComposerVisible, setIsTextComposerVisible] = useState(false);

  const handleAddNote = () => {
    if (!notes.input.trim()) return;
    notes.add();
    setIsTextComposerVisible(false);
  };

  return (
    <View
      className="bg-background px-5 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      <View testID="input-note-container" className="w-full max-w-[320px] self-center">
        {voice.isRecording ? (
          <InlineVoiceRecorder
            durationMs={voice.snapshot.durationMs}
            historyBars={voice.historyBars}
            onSend={voice.stopAndSend}
            onCancel={voice.cancel}
            onMaxDuration={voice.onMaxDuration}
          />
        ) : isTextComposerVisible ? (
          <View
            className="min-h-[60px] flex-row items-center rounded-full border border-border bg-card p-1"
            style={getSurfaceDepthStyle('floating')}
          >
            <Pressable
              onPress={() => setIsTextComposerVisible(false)}
              testID="btn-dismiss-text-note"
              accessibilityRole="button"
              accessibilityLabel="Return to capture options"
              className="h-touch w-touch items-center justify-center rounded-full active:bg-secondary"
            >
              <X size={20} color={colors.muted.foreground} />
            </Pressable>
            <View className="min-w-0 flex-1 py-1">
              <Text className="text-xs font-semibold text-muted-foreground">Text note</Text>
              <TextInput
                autoFocus
                testID="input-note"
                value={notes.input}
                onChangeText={notes.setInput}
                placeholder="Add a site note"
                placeholderTextColor={colors.muted.foreground}
                accessibilityLabel="Text note"
                className="min-h-touch flex-1 text-base text-foreground"
                multiline
                textAlignVertical="top"
                returnKeyType="default"
                blurOnSubmit={false}
              />
            </View>
            {notes.input.trim() ? (
              <Button
                testID="btn-add-note"
                className="min-h-touch min-w-[64px] rounded-full px-3"
                onPress={handleAddNote}
              >
                <Text className="text-sm font-semibold text-primary-foreground">Add</Text>
              </Button>
            ) : null}
          </View>
        ) : (
          <View
            className="min-h-[60px] flex-row items-stretch rounded-full border border-border bg-card p-1"
            style={getSurfaceDepthStyle('floating')}
          >
            <Pressable
              onPress={() => ui.setAttachmentSheetVisible(true)}
              testID="btn-attachment"
              accessibilityRole="button"
              accessibilityLabel="Add attachment"
              className="min-h-touch flex-1 items-center justify-center rounded-full active:bg-secondary"
            >
              <Paperclip size={20} color={colors.foreground} />
              <Text className="text-xs font-semibold text-foreground">Attach</Text>
            </Pressable>
            <Pressable
              onPress={() => setIsTextComposerVisible(true)}
              testID="input-note"
              accessibilityRole="button"
              accessibilityLabel="Add text note"
              className="min-h-touch flex-1 items-center justify-center rounded-full active:bg-secondary"
            >
              <Pencil size={20} color={colors.foreground} />
              <Text className="text-xs font-semibold text-foreground">Text</Text>
            </Pressable>
            <Pressable
              onPress={() => void photo.handleCameraCapture()}
              testID="btn-camera-capture"
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              className="min-h-touch flex-1 items-center justify-center rounded-full active:bg-secondary"
            >
              <Camera size={20} color={colors.foreground} />
              <Text className="text-xs font-semibold text-foreground">Photo</Text>
            </Pressable>
            <Pressable
              onPress={voice.start}
              disabled={voice.pipeline === null}
              testID="btn-record-start"
              accessibilityRole="button"
              accessibilityLabel="Start voice recording"
              accessibilityState={{ disabled: voice.pipeline === null }}
              className={`min-h-touch flex-1 items-center justify-center rounded-full active:bg-secondary ${
                voice.pipeline === null ? 'opacity-50' : ''
              }`}
            >
              <Mic size={20} color={colors.foreground} />
              <Text className="text-xs font-semibold text-foreground">Voice</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
