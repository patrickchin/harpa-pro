/**
 * NoteOptionsSheet — shared kebab-driven options dialog for a single
 * note row (text / voice / photo / document). Used by both the
 * saved-report Notes pane (`ReportNotesPane`) and the draft-side
 * `NoteTimeline` so both surfaces present the same options UX.
 *
 * Replaces inline transcript-toggle panels and ad-hoc per-card option
 * dialogs with a single themed bottom-sheet (AGENTS.md hard rule #4:
 * no `Alert.alert`). Always shows note metadata. Conditionally
 * surfaces:
 *  - "View transcript" — when the row is a voice note with transcript
 *    or body text to show.
 *  - "Edit" — when an `onEdit` callback is supplied (typically only
 *    the draft-side text notes).
 *  - "Delete" — when an `onDelete` callback is supplied. Delete is
 *    funneled through a destructive confirmation sub-stage so a stray
 *    tap can't lose data.
 *
 * Stages (`menu` / `confirm-delete` / `transcript` / `edit`) reuse a
 * single `AppDialogSheet` instance to avoid the iOS RN Modal handoff
 * quirk (can't show a second native modal until the first fully
 * dismisses).
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Pause, Play } from 'lucide-react-native';

import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { useAudioPlayback } from '@/lib/audio/AudioPlaybackProvider';
import { useFileSignedUrl } from '@/lib/uploads/useFileSignedUrl';
import { colors } from '@/lib/design-tokens/colors';
import { formatCapturedAt } from '@/lib/util/date';
import { formatDuration } from '@/components/notes/voiceNoteCardHeader';
import { getDeleteNoteDialogCopy, getDeleteVoiceNoteDialogCopy } from '@/lib/dialogs/app-dialog-copy';

export type NoteOptionsKind = 'text' | 'voice' | 'photo' | 'document';

const KIND_LABEL: Record<NoteOptionsKind, string> = {
  text: 'Text note',
  voice: 'Voice note',
  photo: 'Photo',
  document: 'Document',
};

/**
 * Minimal generic note shape consumed by the sheet. Both the
 * saved-report `ReportNoteRow` and the draft-side `NoteEntry` are
 * adapted to this shape by their hosting components.
 */
export interface NoteOptionsSheetItem {
  /** Stable identifier — used for metadata + delete callback. */
  id: string;
  kind: NoteOptionsKind;
  /** Plain text body (text notes) or fallback transcript text. */
  body?: string | null;
  title?: string | null;
  summary?: string | null;
  transcript?: string | null;
  authorName?: string | null;
  /** ISO-8601, epoch ms, or Date. Formatted via `formatCapturedAt`. */
  capturedAt?: string | number | Date | null;
  durationSec?: number | null;
  fileId?: string | null;
}

export interface NoteOptionsSheetProps {
  visible: boolean;
  note: NoteOptionsSheetItem | null;
  onClose: () => void;
  /** When supplied, surfaces a destructive Delete action. */
  onDelete?: (note: NoteOptionsSheetItem) => void;
  /** When supplied, surfaces an Edit action with an inline editor. */
  onEdit?: (note: NoteOptionsSheetItem, nextBody: string) => void;
  /** Disables the delete action while a mutation is in-flight. */
  deleteInFlight?: boolean;
}

type Stage = 'menu' | 'confirm-delete' | 'transcript' | 'edit';

export function NoteOptionsSheet({
  visible,
  note,
  onClose,
  onDelete,
  onEdit,
  deleteInFlight = false,
}: NoteOptionsSheetProps) {
  const [stage, setStage] = useState<Stage>('menu');
  const [editDraft, setEditDraft] = useState('');

  // Reset to the menu stage + reseed edit draft whenever the sheet is
  // (re-)opened for a different note, so reopening a row doesn't land
  // on a stale screen or carry over a previous draft.
  useEffect(() => {
    if (visible) {
      setStage('menu');
      setEditDraft(note?.body?.trim() ?? '');
    }
  }, [visible, note?.id, note?.body]);

  if (!note) return null;

  const transcriptText =
    note.kind === 'voice'
      ? note.transcript?.trim() || note.body?.trim() || null
      : null;
  const summaryText = note.kind === 'voice' ? note.summary?.trim() || null : null;
  const titleText = note.kind === 'voice' ? note.title?.trim() || null : null;
  const bodyPreview = note.body?.trim() || null;
  const capturedDisplay = formatCapturedAt(note.capturedAt ?? null);
  const deleteCopy =
    note.kind === 'voice'
      ? getDeleteVoiceNoteDialogCopy()
      : getDeleteNoteDialogCopy();

  // ── Stage: confirm delete ────────────────────────────────────────
  if (stage === 'confirm-delete' && onDelete) {
    return (
      <AppDialogSheet
        visible={visible}
        title={deleteCopy.title}
        message={deleteCopy.message}
        noticeTone={deleteCopy.tone}
        noticeTitle={deleteCopy.noticeTitle}
        onClose={onClose}
        canDismiss={!deleteInFlight}
        actions={[
          {
            label: deleteInFlight ? 'Deleting…' : deleteCopy.confirmLabel,
            variant: 'destructive',
            disabled: deleteInFlight,
            testID: 'btn-note-options-confirm-delete',
            onPress: () => onDelete(note),
          },
          {
            label: deleteCopy.cancelLabel ?? 'Cancel',
            variant: 'secondary',
            disabled: deleteInFlight,
            testID: 'btn-note-options-cancel-delete',
            onPress: () => setStage('menu'),
          },
        ]}
      />
    );
  }

  // ── Stage: view transcript (voice only) ──────────────────────────
  if (stage === 'transcript') {
    return (
      <AppDialogSheet
        visible={visible}
        title="Transcript"
        onClose={onClose}
        actions={[
          {
            label: 'Back',
            variant: 'secondary',
            testID: 'btn-note-options-transcript-back',
            onPress: () => setStage('menu'),
          },
        ]}
      >
        <ScrollView
          className="max-h-72 rounded-md border border-border bg-muted/40 p-3"
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          testID="note-options-transcript-scroll"
        >
          <Text
            className="text-sm leading-5 text-foreground"
            selectable
            testID="note-options-transcript-text"
          >
            {transcriptText ?? 'No transcript available.'}
          </Text>
        </ScrollView>
      </AppDialogSheet>
    );
  }

  // ── Stage: edit body (text-style notes with onEdit) ──────────────
  if (stage === 'edit' && onEdit) {
    const trimmed = editDraft.trim();
    const original = note.body?.trim() ?? '';
    const canSave = trimmed.length > 0 && trimmed !== original;
    return (
      <AppDialogSheet
        visible={visible}
        title="Edit note"
        onClose={onClose}
        actions={[
          {
            label: 'Save',
            variant: 'default',
            disabled: !canSave,
            testID: 'btn-note-options-save-edit',
            onPress: () => {
              if (!canSave) return;
              onEdit(note, trimmed);
            },
          },
          {
            label: 'Cancel',
            variant: 'quiet',
            testID: 'btn-note-options-cancel-edit',
            onPress: () => setStage('menu'),
          },
        ]}
      >
        <TextInput
          value={editDraft}
          onChangeText={setEditDraft}
          multiline
          autoFocus
          textAlignVertical="top"
          className="min-h-[96px] rounded-md border border-border bg-background p-3 text-base text-foreground"
          testID="input-note-options-edit"
        />
      </AppDialogSheet>
    );
  }

  // ── Stage: main options menu ─────────────────────────────────────
  const actions: Array<Parameters<typeof AppDialogSheet>[0]['actions'][number]> =
    [];
  if (note.kind === 'voice' && transcriptText) {
    actions.push({
      label: 'View transcript',
      variant: 'secondary' as const,
      testID: 'btn-note-options-view-transcript',
      onPress: () => setStage('transcript'),
    });
  }
  if (onEdit && (note.kind === 'text' || note.kind === 'document')) {
    actions.push({
      label: 'Edit',
      variant: 'secondary' as const,
      testID: 'btn-note-options-edit',
      onPress: () => {
        setEditDraft(note.body?.trim() ?? '');
        setStage('edit');
      },
    });
  }
  if (onDelete) {
    actions.push({
      label: 'Delete',
      variant: 'destructive' as const,
      testID: 'btn-note-options-delete',
      onPress: () => setStage('confirm-delete'),
    });
  }
  actions.push({
    label: 'Cancel',
    variant: 'quiet' as const,
    testID: 'btn-note-options-cancel',
    onPress: onClose,
  });

  return (
    <AppDialogSheet
      visible={visible}
      title="Note options"
      onClose={onClose}
      actions={actions}
    >
      <View className="gap-3">
        {note.kind === 'voice' && note.fileId ? (
          <VoicePlayRow
            fileId={note.fileId}
            durationSec={note.durationSec ?? null}
            sheetVisible={visible}
          />
        ) : null}
        <View className="gap-2 rounded-md border border-border bg-muted/30 p-3">
          <MetaRow label="Kind" value={KIND_LABEL[note.kind]} />
          <MetaRow label="Author" value={note.authorName?.trim() || 'Unknown'} />
          {capturedDisplay ? (
            <MetaRow label="Captured" value={capturedDisplay} />
          ) : null}
          {titleText ? <MetaRow label="Title" value={titleText} /> : null}
          {note.kind === 'voice' && note.durationSec ? (
            <MetaRow label="Duration" value={formatDuration(note.durationSec)} />
          ) : null}
          {note.fileId ? (
            <MetaRow label="File ID" value={note.fileId} mono />
          ) : null}
          <MetaRow label="Note ID" value={note.id} mono />
          {summaryText ? (
            <View className="gap-1 pt-1">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Summary
              </Text>
              <Text className="text-sm leading-5 text-foreground" selectable>
                {summaryText}
              </Text>
            </View>
          ) : note.kind !== 'voice' && bodyPreview ? (
            <View className="gap-1 pt-1">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Preview
              </Text>
              <Text
                className="text-sm leading-5 text-foreground"
                selectable
                numberOfLines={6}
              >
                {bodyPreview}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </AppDialogSheet>
  );
}

interface MetaRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

/**
 * Inline play / pause row rendered inside `NoteOptionsSheet` for
 * voice notes. Kept as a separate component so that the
 * `useFileSignedUrl` + `useAudioPlayback` hooks only mount when:
 *  - the sheet is actually visible for a voice row with a `fileId`
 *  - and therefore a QueryClient is in scope.
 * Text/photo notes (and screens that don't wire signed URLs in tests)
 * never instantiate this component, so they don't pay for it.
 *
 * Pauses playback when this row unmounts (i.e. when the sheet closes
 * or the user navigates to another stage) — closing the options is
 * the natural "I'm done with this row" signal.
 */
interface VoicePlayRowProps {
  fileId: string;
  durationSec: number | null;
  sheetVisible: boolean;
}

function VoicePlayRow({ fileId, durationSec, sheetVisible }: VoicePlayRowProps) {
  const signedUrlQuery = useFileSignedUrl(fileId, { enabled: sheetVisible });
  const audioUri =
    (signedUrlQuery.data as { url?: string } | undefined)?.url ?? null;
  const playback = useAudioPlayback();
  const isPlayingThis =
    audioUri !== null &&
    playback.status.uri === audioUri &&
    playback.status.playing;
  const positionSec =
    playback.status.uri === audioUri ? playback.status.positionSec : 0;
  const playbackDurationSec =
    (playback.status.uri === audioUri ? playback.status.durationSec : 0) ||
    durationSec ||
    0;

  useEffect(() => {
    return () => {
      // Pause when the sheet closes / row unmounts. We check the
      // current playback status at unmount time via the latest
      // closure values — safe because the global provider's
      // `status` reference updates on every poll.
      if (isPlayingThis) {
        playback.pause();
      }
    };
     
  }, []);

  const canPlay = Boolean(audioUri);
  const label = isPlayingThis
    ? `Pause • ${formatDuration(positionSec)} / ${formatDuration(playbackDurationSec)}`
    : canPlay
      ? `Play voice note${playbackDurationSec ? ` • ${formatDuration(playbackDurationSec)}` : ''}`
      : 'Loading audio…';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isPlayingThis ? 'Pause voice note' : 'Play voice note'}
      testID="btn-note-options-play"
      disabled={!canPlay}
      onPress={() => {
        if (!audioUri) return;
        if (isPlayingThis) playback.pause();
        else void playback.play(audioUri);
      }}
      className={`flex-row items-center gap-3 rounded-md border border-border px-3 py-3 ${
        canPlay ? 'bg-card' : 'bg-muted/40'
      }`}
    >
      <View
        className={`h-9 w-9 items-center justify-center rounded-full ${
          canPlay ? 'bg-primary' : 'bg-muted'
        }`}
      >
        {isPlayingThis ? (
          <Pause size={18} color={colors.primary.foreground} />
        ) : (
          <Play
            size={18}
            color={canPlay ? colors.primary.foreground : colors.muted.foreground}
          />
        )}
      </View>
      <Text className="flex-1 text-sm font-medium text-foreground">
        {label}
      </Text>
    </Pressable>
  );
}

function MetaRow({ label, value, mono }: MetaRowProps) {
  return (
    <View className="flex-row items-start gap-3">
      <Text className="w-20 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
      <Text
        className={`flex-1 text-xs text-foreground ${mono ? 'font-mono' : ''}`}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

// Exported for tests / future cross-modal handoffs that need the same
// 600ms iOS defer used by TextNoteCard / ReportActionsMenu when
// transitioning between distinct native Modals.
export const NOTE_OPTIONS_MODAL_HANDOFF_MS = 600;
