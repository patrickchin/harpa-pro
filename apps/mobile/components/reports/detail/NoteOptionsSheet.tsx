/**
 * NoteOptionsSheet — kebab-driven options dialog for a single
 * saved-report note row (text / voice / photo / document).
 *
 * Replaces the inline transcript expand panel + ad-hoc actions on note
 * cards with a single themed bottom-sheet (AGENTS.md hard rule #4: no
 * Alert.alert). Always shows note metadata; for voice rows with a
 * transcript adds a "View transcript" action that opens a secondary
 * sheet with the full scrollable transcript text. Delete is funneled
 * through a destructive confirmation sub-sheet so a stray tap can't
 * lose data.
 *
 * iOS quirk: RN `Modal` cannot present a second native modal until the
 * first is fully dismissed, so transitions between sheets defer the
 * follow-up open by 600ms (same pattern used in TextNoteCard /
 * ReportActionsMenu).
 */
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { formatCapturedAt } from '@/lib/date';
import { formatDuration } from '@/features/voice/voiceNoteCardHeader';
import { getDeleteNoteDialogCopy, getDeleteVoiceNoteDialogCopy } from '@/lib/app-dialog-copy';

import type { ReportNoteRow } from './ReportNotesPane';

const MODAL_HANDOFF_MS = 600;

const KIND_LABEL: Record<ReportNoteRow['kind'], string> = {
  text: 'Text note',
  voice: 'Voice note',
  photo: 'Photo',
  document: 'Document',
};

export interface NoteOptionsSheetProps {
  visible: boolean;
  note: ReportNoteRow | null;
  onClose: () => void;
  onDelete: (noteId: string) => void;
  /** Disables the delete action while a mutation is in-flight. */
  deleteInFlight?: boolean;
}

type Stage = 'menu' | 'confirm-delete' | 'transcript';

export function NoteOptionsSheet({
  visible,
  note,
  onClose,
  onDelete,
  deleteInFlight = false,
}: NoteOptionsSheetProps) {
  const [stage, setStage] = useState<Stage>('menu');

  // Reset to the menu stage whenever the sheet is (re-)opened for a
  // different note, so reopening a row doesn't land on a stale screen.
  useEffect(() => {
    if (visible) setStage('menu');
  }, [visible, note?.id]);

  if (!note) return null;

  const transcriptText =
    note.kind === 'voice'
      ? note.transcript?.trim() || note.body?.trim() || null
      : null;
  const summaryText = note.kind === 'voice' ? note.summary?.trim() || null : null;
  const titleText = note.kind === 'voice' ? note.title?.trim() || null : null;
  const bodyPreview = note.body?.trim() || null;
  const capturedDisplay = formatCapturedAt(note.createdAt);
  const deleteCopy =
    note.kind === 'voice'
      ? getDeleteVoiceNoteDialogCopy()
      : getDeleteNoteDialogCopy();

  // ── Stage: confirm delete ────────────────────────────────────────
  if (stage === 'confirm-delete') {
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
            onPress: () => onDelete(note.id),
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

  // ── Stage: main options menu ─────────────────────────────────────
  const actions = [];
  if (note.kind === 'voice' && transcriptText) {
    actions.push({
      label: 'View transcript',
      variant: 'secondary' as const,
      testID: 'btn-note-options-view-transcript',
      onPress: () => {
        // Same-sheet stage swap — no native-modal handoff needed
        // because we're reusing the same Modal instance.
        setStage('transcript');
      },
    });
  }
  actions.push({
    label: 'Delete',
    variant: 'destructive' as const,
    testID: 'btn-note-options-delete',
    onPress: () => setStage('confirm-delete'),
  });
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
    </AppDialogSheet>
  );
}

interface MetaRowProps {
  label: string;
  value: string;
  mono?: boolean;
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
// 600ms iOS defer used by TextNoteCard / ReportActionsMenu.
export const NOTE_OPTIONS_MODAL_HANDOFF_MS = MODAL_HANDOFF_MS;
