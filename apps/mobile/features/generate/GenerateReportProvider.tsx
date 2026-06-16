/**
 * GenerateReportProvider — scaffold for the Generate Report screen.
 *
 * Ported (subset) from
 * `../haru3-reports/apps/mobile/components/reports/generate/GenerateReportProvider.tsx`
 * on branch `dev`. The canonical source owns every orchestration hook
 * inline (notes, voice/photo pipelines, draft persistence, report
 * generation, image preview). For P3.6 we only need the surface the
 * Notes tab consumes — text input, tab state, an empty-by-default
 * timeline — so this provider takes that surface as PROPS and exposes
 * it through context.
 *
 * Fields the Report (P3.7) and Edit (P3.8) tabs will need (`generation`,
 * `draft`, `voice`, `photo`, `preview`, `members`, `menuActions`,
 * `timeline.items` from `useNoteTimeline`) are present as
 * structurally-stable defaults / no-ops with TODO markers so wiring
 * them up later is a one-field-at-a-time change rather than a
 * provider rewrite.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { TabKey } from '@/components/reports/generate/tabs';
import { createEmptyReport } from '@/lib/reports/report-edit-helpers';
import type { NoteEntry } from '@/lib/notes/note-entry';
import type { GeneratedSiteReport } from '@harpa/report-core';
import { buildAttachments, type Attachment } from '@/lib/notes/attachments';
import {
  RECORDER_START_FAILED_MESSAGE,
  useInlineRecorder,
} from '@/features/voice/useInlineRecorder';
import { MAX_DURATION_MS } from '@/features/voice/InlineVoiceRecorder';
import { useVoiceNotePipeline } from '@/features/voice/useVoiceNotePipeline';
import { useAudioPlayback } from '@/lib/audio/AudioPlaybackProvider';
import { useMeQuery } from '@/lib/api/hooks';
import { usePhotoUploadEntries } from '@/lib/uploads/usePhotoUploadEntries';
import type { RecorderSnapshot } from '@/features/voice/recorder-types';
import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { UsageLimitDialog } from '@/components/account/UsageLimitDialog';

/**
 * Props passed to `GenerateReportProvider`. Route wrappers wire real
 * data (eventually from `useReportQuery` + `useReportNotesQuery`); dev
 * mirrors + tests pass canned values.
 */
export interface GenerateReportProviderProps {
  project: string;
  reportNumber: number | null;
  /**
   * Server-side report uuid. Required for the voice pipeline
   * (`useVoiceNotePipeline`) which posts to `/reports/{report}/notes/voice`.
   * `null` before the report row has loaded — the mic button is rendered
   * disabled in that case so the modal can't open without a target.
   */
  reportId?: string | null;
  /** Notes already saved on the report. Empty array on a fresh draft. */
  notes: readonly NoteEntry[];
  /** True while the initial note timeline is being fetched. */
  notesLoading?: boolean;
  /**
   * Called when the user taps "Add" on a non-empty text input. The
   * route wrapper is responsible for the actual mutation (P3.8+); the
   * provider just hands the trimmed body up.
   */
  onAddTextNote?: (body: string) => void;
  /**
   * Called when the user confirms deletion of a note in the timeline.
   * The route wrapper owns the `useDeleteNoteMutation` call + optimistic
   * cleanup. When omitted the dialog just closes (legacy P3.6 behaviour).
   */
  onDeleteNote?: (note: NoteEntry, sourceIndex: number) => void;
  /**
   * Called when the user edits a text note's body. Route wires
   * `useUpdateNoteMutation`. When omitted edit is hidden.
   */
  onUpdateNote?: (note: NoteEntry, sourceIndex: number, nextBody: string) => void;
  /** user_id → display name lookup for note author bylines. */
  memberNames?: ReadonlyMap<string, string>;
  /** Report title for the header. `null` falls back to "New Report". */
  reportTitle?: string | null;
  // ── P3.7: Report-tab fields ────────────────────────────────────
  /**
   * Generated report payload. `null` until the first generation lands
   * (or while the user hasn't touched manual entry yet).
   */
  report?: GeneratedSiteReport | null;
  /** True while a generation request is in flight. */
  isGeneratingReport?: boolean;
  /** Latest generation error message, or `null`. */
  generationError?: string | null;
  /** Optional action label for non-generation errors surfaced in the Report tab. */
  generationErrorActionLabel?: string;
  /** Optional action handler for non-generation errors surfaced in the Report tab. */
  onGenerationErrorAction?: () => void;
  /** Debug payload (prompts + raw response) from last (re)generate. */
  lastGeneration?: GenerationDebug | null;
  /** Count of notes added since the last successful generation. @deprecated Use needsRegeneration. */
  notesSinceLastGeneration?: number;
  /** True when notes have changed since the last generation. */
  needsRegeneration?: boolean;
  /** Called when the user taps Retry / Regenerate. */
  onRegenerate?: () => void;
  /**
   * Called when the user taps "Edit manually" on the empty Report
   * tab. Defaults to switching the active tab to `edit`.
   */
  onEditManually?: () => void;
  /**
   * Called when the Edit-tab form mutates the report. The provider
   * has no opinion on persistence — the route wrapper wires this to
   * a local React state (and eventually `useReportDraftPersistence`).
   * When omitted, `generation.setReport` is a no-op (read-only).
   */
  onSetReport?: (next: GeneratedSiteReport) => void;
  /** True while autosave is in flight. Surfaces in the Edit tab header. */
  isAutoSaving?: boolean;
  /** Epoch ms of the last successful autosave, or `null` if none. */
  lastSavedAt?: number | null;
  /** True while finalize is in flight. */
  isFinalizing?: boolean;
  /** Latest finalize error, or `null`. */
  finalizeError?: Error | string | null;
  /**
   * Called when the user confirms finalize in the dialog. The route
   * wrapper owns the actual `POST /finalize` mutation; the provider
   * just bubbles the confirmation up. When omitted the dialog still
   * mounts but the confirm button is a no-op (matches the canonical
   * fallback before `useReportDraftPersistence` lands).
   */
  onFinalize?: () => void;
  /** Called when the user taps a file/image in the timeline or report. */
  onOpenFile?: (fileId: string) => void;
  /**
   * Called when the user taps the Photo (camera) button. The route
   * wrapper owns navigation into the camera modal + draining the
   * resulting URIs on focus return. When omitted the button is a
   * no-op.
   */
  onCameraCapture?: () => void;
  /**
   * Called when the user picks an attachment category from the
   * attachment sheet. The route wrapper owns the picker integration
   * + upload pipeline. When omitted this is a no-op.
   */
  onPickAttachment?: (category: 'image' | 'document') => void;
  /**
   * Called when the user picks (or clears) a placement target for a
   * photo group on the Report tab. Route wrapper wires this to
   * the report attachment placement mutation. When omitted the placement chip
   * is hidden and the photo block falls back to the legacy "stuck at
   * the bottom" rendering.
   */
  onPlacePhotoGroup?: (input: {
    noteId: string;
    placement: { kind: 'issue' | 'section'; index: number } | null;
  }) => void;
  /** Initial tab the screen opens on. Defaults to `notes`. */
  initialTab?: TabKey;
  children: ReactNode;
}

interface VoiceSurface {
  /**
   * Phase H: true while the inline WhatsApp-style strip should render
   * in place of the text-note input row.
   */
  isRecording: boolean;
  /** Latest recorder snapshot — duration drives the inline counter. */
  snapshot: RecorderSnapshot;
  /** Scrolling waveform samples (oldest → newest, capped). */
  historyBars: readonly number[];
  interimTranscript: string;
  speechError: string | null;
  /**
   * Begin recording inline. Idempotent. If mic permission was
   * denied the provider opens its permission dialog instead of
   * arming the recorder.
   */
  start: () => void;
  /**
   * Stop the recorder, hand the finalised audio to the pipeline,
   * and reset the strip. No-op when not recording.
   */
  stopAndSend: () => void;
  /** Discard the in-flight recording and return to the input row. */
  cancel: () => void;
  /**
   * Phase H+: fires when the inline recorder hits its hard cap
   * (`MAX_DURATION_MS`, 15 min). The provider surfaces an
   * `AppDialogSheet` so the user understands the note was sent
   * automatically.
   */
  onMaxDuration: () => void;
  /**
   * Phase D: pipeline state visible to surfaces that want to show a
   * "Transcribing voice note…" indicator after the strip closes.
   * `null` when the provider was rendered without `reportId`
   * (pipeline can't run without a target).
   */
  pipeline: {
    step: 'idle' | 'uploading' | 'transcribing' | 'saved' | 'failed';
    error: string | null;
  } | null;
  /**
   * Phase E: retry from the last failed pipeline step. No-op when
   * there is no retained capture (e.g. fresh provider mount). Called
   * by `VoiceNoteCard`'s in-line Retry pill.
   */
  retry: () => void;
}

interface PhotoSurface {
  handleCameraCapture: () => Promise<void> | void;
  handleMenuPick: (
    category: 'image' | 'document',
  ) => Promise<void> | void;
  /** Retry a failed image upload job. */
  retryUpload: (jobId: string) => void;
  /** Cancel / dismiss an in-flight or failed image upload job. */
  cancelUpload: (jobId: string) => void;
}

interface UISurface {
  attachmentSheetVisible: boolean;
  setAttachmentSheetVisible: (visible: boolean) => void;
  fileUploadError: string | null;
  setFileUploadError: (msg: string | null) => void;
}

interface NotesSurface {
  list: readonly NoteEntry[];
  /** Mirrors canonical: total source-note count for the tab badge. */
  totalCount: number;
  /**
   * Raw note rows. Consumed by surfaces that need the file_id ↔ note
   * linkage (timeline metadata, ReportPhotos). P3.7 keeps this as
   * `null` until the canonical `useLocalReportNotes` hook lands.
   */
  rows: null;
  input: string;
  setInput: (next: string) => void;
  add: () => void;
  deleteIndex: number | null;
  setDeleteIndex: (i: number | null) => void;
  confirmDelete: () => void;
  /** Direct delete used by the shared NoteOptionsSheet, which has its
   *  own confirmation stage. */
  deleteAt: (sourceIndex: number) => void;
  /** True iff a route-provided onUpdateNote is wired. */
  canEdit: boolean;
  /** Update body for a note at the given source index. */
  update: (sourceIndex: number, nextBody: string) => void;
}

interface TabsSurface {
  active: TabKey;
  set: (next: TabKey) => void;
  /**
   * Edit tab opener — separate from `set('edit')` because canonical
   * lazily seeds an empty report when the user opens Edit. Currently
   * just switches the tab; lazy-seed lands with P3.8.
   */
  openEdit: () => void;
  /**
   * Called by the Report tab "Edit manually" CTA. Defaults to
   * `set('edit')` but routes can override (e.g. to seed an empty
   * report at the same time, matching canonical).
   */
  editManually: () => void;
}

interface TimelineSurface {
  /** Items used by the timeline list. P3.6 = text notes only. */
  items: readonly NoteEntry[];
  isLoading: boolean;
}

interface GenerationSurface {
  /** Generated report payload. `null` until a report exists. */
  report: GeneratedSiteReport | null;
  /**
   * Mutator for the report. Calls the parent-provided `onSetReport`
   * if any; otherwise a no-op (read-only). Always defined so consumers
   * can reference it without a guard.
   */
  setReport: (next: GeneratedSiteReport) => void;
  /** True while the AI generation request is in flight. */
  isUpdating: boolean;
  /** Latest generation error, or `null`. */
  error: string | null;
  /** Label for the Report-tab error action. Defaults to Retry. */
  errorActionLabel: string;
  /** Handler for the Report-tab error action. Defaults to regenerate. */
  errorAction: () => void;
  /** Count of notes added since the last successful generation. @deprecated Use needsRegeneration. */
  notesSinceLastGeneration: number;
  /** True when notes have changed since the last generation. */
  needsRegeneration: boolean;
  /** True once a report has been generated at least once. */
  hasReport: boolean;
  /**
   * Debug payload from the last (re)generate response. Surfaces in the
   * Debug tab. `null` when no generation has happened in this session.
   */
  lastGeneration: GenerationDebug | null;
}

export interface GenerationDebug {
  systemPrompt: string;
  userPrompt: string;
  rawText: string;
  model: string;
  vendor: string;
}

interface DraftSurface {
  /** True while finalize is in flight. */
  isFinalizing: boolean;
  /** Opens the finalize-confirm dialog. */
  setIsFinalizeConfirmVisible: (visible: boolean) => void;
  isFinalizeConfirmVisible: boolean;
  /** Latest finalize error, or `null`. */
  finalizeError: Error | string | null;
  /**
   * Confirm-finalize handler bubbled up by the dialog. Always
   * defined — defaults to a no-op so callers can invoke it without
   * a guard.
   */
  finalize: () => void;
  /** True while autosave is in flight (Edit-tab header). */
  isAutoSaving: boolean;
  /** Epoch ms of last successful autosave, or `null`. */
  lastSavedAt: number | null;
}

interface PreviewSurface {
  /** Open a file from the timeline / report. No-op default. */
  openFile: (fileId: string) => void;
  /** Gallery of all photo notes — passed to ImagePreviewModal. */
  photoGallery: ReadonlyArray<{
    fileId: string;
    thumbnailFileId: string | null;
    noteId: string;
    title: string;
    cacheKey: string;
  }>;
  /** Current photo index when the gallery is open; null when closed. */
  photoIndex: number | null;
  /** Open the gallery focussed on the photo backed by `fileId`. */
  openPhoto: (fileId: string) => void;
  /** Dismiss the gallery. */
  closePhoto: () => void;
}

/** Surface for editing photo placements from the Report tab. */
interface PlacementSurface {
  /**
   * Called when the user picks (or clears) a placement target for a
   * photo group. `null` clears the placement (returns to "Unplaced").
   * `undefined` here means the route did not wire the mutator —
   * components should hide the placement chip entirely.
   */
  onPlacePhotoGroup?: (input: {
    noteId: string;
    placement: { kind: 'issue' | 'section'; index: number } | null;
  }) => void;
  /**
   * False while backend generation is replacing report.body. Consumers
   * should keep existing placement display visible but hide/disable
   * controls that would write placement changes.
   */
  canPlacePhotoGroup: boolean;
}

export interface GenerateReportContextValue {
  project: string;
  reportNumber: number | null;
  reportTitle: string;
  notes: NotesSurface;
  tabs: TabsSurface;
  timeline: TimelineSurface;
  generation: GenerationSurface;
  draft: DraftSurface;
  voice: VoiceSurface;
  photo: PhotoSurface;
  preview: PreviewSurface;
  placement: PlacementSurface;
  ui: UISurface;
  members: ReadonlyMap<string, string>;
  /** Bubbled up by the Notes input + attachment sheet. P3.8+ wires uploads. */
  handlePickAttachment: (category: 'image' | 'document') => void;
  /** Triggers report regeneration. No-op when no `onRegenerate` is provided. */
  handleRegenerate: () => void;
}

const GenerateReportContext =
  createContext<GenerateReportContextValue | null>(null);

export function useGenerateReport(): GenerateReportContextValue {
  const v = useContext(GenerateReportContext);
  if (!v) {
    throw new Error(
      'useGenerateReport must be used inside <GenerateReportProvider>',
    );
  }
  return v;
}

const EMPTY_MEMBERS: ReadonlyMap<string, string> = new Map();

/**
 * Remap saved attachment keys to their pending synthetic job keys so
 * photo tile identity persists across the pending → saved transition.
 * @internal exported for unit testing
 */
export function remapAttachmentKeys(
  attachments: readonly Attachment[],
  fileIdToAttachmentKey: ReadonlyMap<string, string>,
): readonly Attachment[] {
  return attachments.map((att) => {
    const synthetic = att.fileId
      ? fileIdToAttachmentKey.get(att.fileId)
      : undefined;
    return synthetic ? { ...att, key: synthetic } : att;
  });
}

/**
 * Remove local upload-queue jobs backing a deleted photo note so
 * completed synthetic cards do not reappear after the server row is
 * optimistically removed.
 * @internal exported for unit testing
 */
export function cancelImageAttachmentJobs(
  note: NoteEntry,
  cancel: (jobId: string) => void,
  fileIdToAttachmentKey: ReadonlyMap<string, string> = new Map(),
): void {
  if (note.source !== 'image' || !note.attachments?.length) return;
  for (const attachment of note.attachments) {
    const jobId =
      attachment.jobId ??
      (attachment.fileId ? fileIdToAttachmentKey.get(attachment.fileId) : undefined) ??
      (attachment.thumbnailFileId
        ? fileIdToAttachmentKey.get(attachment.thumbnailFileId)
        : undefined);
    if (jobId) cancel(jobId);
  }
}

export function GenerateReportProvider({
  project,
  reportNumber,
  reportId = null,
  notes,
  notesLoading = false,
  onAddTextNote,
  onDeleteNote,
  onUpdateNote,
  memberNames,
  reportTitle,
  report = null,
  isGeneratingReport = false,
  generationError = null,
  generationErrorActionLabel,
  onGenerationErrorAction,
  lastGeneration = null,
  notesSinceLastGeneration = 0,
  needsRegeneration = notesSinceLastGeneration > 0,
  onRegenerate,
  onEditManually,
  onSetReport,
  isAutoSaving = false,
  lastSavedAt = null,
  isFinalizing = false,
  finalizeError = null,
  onFinalize,
  onOpenFile,
  onCameraCapture,
  onPickAttachment,
  onPlacePhotoGroup,
  initialTab = 'notes',
  children,
}: GenerateReportProviderProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [input, setInput] = useState('');
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);
  const [isFinalizeConfirmVisible, setIsFinalizeConfirmVisible] =
    useState(false);
  const [photoPreviewIndex, setPhotoPreviewIndex] = useState<number | null>(
    null,
  );

  // Phase H: inline recorder state lives here so the input bar can
  // morph between text/photo/mic and the recording strip without
  // remounting the provider's children.
  const inlineRecorder = useInlineRecorder();

  // Phase D: voice pipeline. Always called (hooks are unconditional)
  // even when reportId is null — `start()` then short-circuits.
  // Using a sentinel '' keeps the hook signature simple; the mic
  // button is disabled in that case (see GenerateReportInputBar).
  const voicePipeline = useVoiceNotePipeline({ reportId: reportId ?? '' });
  const handleVoiceCapture = useCallback(
    async (result: import('@/features/voice/recorder-types').RecorderResult) => {
      if (!reportId) {
        throw new Error(
          'Voice note saved before the report row was ready. Reopen the screen and try again.',
        );
      }
      await voicePipeline.capture(result);
    },
    [reportId, voicePipeline],
  );

  // Phase H: wire the inline strip's Send button to the pipeline.
  // `stopAndCapture()` finalises the audio file; on a successful
  // capture we hand it to the pipeline (fire-and-forget — the
  // synthetic timeline entry below shows progress, errors surface
  // via the existing VoiceNoteCard retry pill).
  const playback = useAudioPlayback();
  const handleVoiceStart = useCallback(() => {
    if (!reportId) return;
    // If a previous voice note is currently playing, stop it before
    // we take over the audio session for the mic. Otherwise on iOS
    // the playback player would be interrupted abruptly by the
    // category switch and the UI would never see the pause.
    if (playback.status.playing) {
      playback.stop();
    }
    void inlineRecorder.start();
  }, [reportId, inlineRecorder, playback]);
  const handleVoiceStopAndSend = useCallback(() => {
    void (async () => {
      const result = await inlineRecorder.stopAndCapture();
      if (!result) return;
      try {
        await handleVoiceCapture(result);
      } catch {
        // Pipeline already surfaces the error via voicePipeline.state;
        // the VoiceNoteCard renders Retry. No Alert.alert (Pitfall 12).
      }
    })();
  }, [inlineRecorder, handleVoiceCapture]);
  const handleVoiceCancel = useCallback(() => {
    void inlineRecorder.cancel();
  }, [inlineRecorder]);

  // Phase H+: hard-stop dialog. Fired from `InlineVoiceRecorder` when
  // `durationMs` crosses `MAX_DURATION_MS`. The recorder also calls
  // `onSend` in the same tick, so the strip unmounts immediately — we
  // surface a one-shot alert so the user knows their recording wasn't
  // silently truncated. Driven by local visible state (matches the
  // existing permission + recorder-error `AppDialogSheet`s below) so
  // we don't take a dependency on `DialogSheetProvider` (every screen
  // test that renders this provider would otherwise need a wrapper).
  const [maxDurationDialogVisible, setMaxDurationDialogVisible] = useState(false);
  const handleVoiceMaxDuration = useCallback(() => {
    setMaxDurationDialogVisible(true);
  }, []);
  const dismissMaxDurationDialog = useCallback(() => {
    setMaxDurationDialogVisible(false);
  }, []);
  const maxDurationMin = Math.round(MAX_DURATION_MS / 60_000);

  // Phase E: surface the in-flight pipeline as a synthetic NoteEntry so
  // `NoteTimeline` can render the spinner / failure pill the same way it
  // renders saved voice notes. On `step === 'saved'` we keep a synthetic
  // built from the server response until the invalidated `reportNotes`
  // refetch lands the real row — otherwise the card flashes out and
  // back in during that gap.
  // Photo equivalent: image rows in flight via `useFileUpload()` jobs
  // are surfaced through `usePhotoUploadEntries` so a `PhotoNoteCard`
  // appears in its pending state the instant the user picks/snaps a
  // photo (Pitfall 12 — no
  // Alert.alert, no "did it work?" anxiety). Failed jobs stay visible
  // until the user retries or dismisses.
  // Current user id — wired into synthetic in-flight rows (voice +
  // photo) so the shared `NoteCardHeader` displays the real author
  // instead of falling back to "Unknown" while uploads are running.
  // The query is cheap (cached, single `/me` request) and degrades to
  // `undefined` during the initial fetch — same as today's behaviour.
  const meQuery = useMeQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const meId = meQuery.data?.user?.id;
  const photoUploads = usePhotoUploadEntries(reportId, meId);
  const timelineItems = useMemo<readonly NoteEntry[]>(() => {
    const { step, note: savedNote, error, fileId, capture } = voicePipeline.state;
    const photoEntries = photoUploads.entries;
    const noteIdMap = photoUploads.noteIdToSyntheticId;
    const fileIdToKeyMap = photoUploads.fileIdToAttachmentKey;

    // Rewrite saved server image rows to:
    // 1. Carry `attachments[]` built from legacy fields, with keys
    //    remapped to pending synthetic job ids so photo tile identity
    //    persists across the pending → saved transition.
    // 2. Inherit the synthetic React key minted by the upload queue so
    //    React reuses the PhotoNoteCard instance instead of remounting.
    const remappedNotes: NoteEntry[] = notes.map((n) => {
      const builtAttachments = buildAttachments(n);
      const attachments =
        builtAttachments.length > 0
          ? remapAttachmentKeys(builtAttachments, fileIdToKeyMap)
          : undefined;
      const syntheticId = n.id ? noteIdMap.get(n.id) : undefined;
      const base: NoteEntry = attachments ? { ...n, attachments } : n;
      if (!syntheticId || syntheticId === n.id) return base;
      return { ...base, reactKey: syntheticId };
    });

    // Drop synthetic photo entries whose resolved noteId is already
    // present in the saved notes list — mirrors the voice pattern
    // below. The remapped saved row now carries the synthetic's id
    // so React picks up where the synthetic left off.
    const savedNoteIds = new Set<string>();
    for (const n of notes) if (n.id) savedNoteIds.add(n.id);
    const filteredPhotoEntries = photoEntries.filter(
      (e) => !e.noteId || !savedNoteIds.has(e.noteId),
    );

    const baseWithPhotos =
      filteredPhotoEntries.length > 0
        ? [...remappedNotes, ...filteredPhotoEntries]
        : remappedNotes;
    if (step === 'idle' || !reportId) return baseWithPhotos;
    if (savedNote && notes.some((n) => n.id === savedNote.id)) {
      return baseWithPhotos;
    }

    const synthetic: NoteEntry = savedNote
      ? {
          id: savedNote.id,
          authorId: savedNote.authorId,
          text: savedNote.body ?? '',
          addedAt: new Date(savedNote.createdAt).getTime(),
          source: 'voice',
          fileId: savedNote.fileId,
          durationSec: savedNote.durationSec ?? null,
          transcript: savedNote.transcript,
          summary: savedNote.summary ?? null,
          title: savedNote.title ?? null,
        }
      : {
          id: '__voice-pipeline-pending',
          authorId: meId,
          text: '',
          addedAt: Date.now(),
          source: 'voice',
          voiceStatus: step === 'saved' ? null : step,
          voiceError: error,
          fileId,
          durationSec: capture?.durationSec ?? null,
        };
    return [...baseWithPhotos, synthetic];
  }, [
    notes,
    reportId,
    voicePipeline.state,
    photoUploads.entries,
    photoUploads.noteIdToSyntheticId,
    photoUploads.fileIdToAttachmentKey,
    meId,
  ]);

  const handleRetryVoice = useCallback(() => {
    void voicePipeline.retry();
  }, [voicePipeline]);

  // Gallery of every image-note in the timeline — drives the
  // fullscreen swipeable preview wired in `GenerateReportDialogs`.
  // Order matches `timelineItems`; tapping any thumbnail in the Notes
  // tab or Report tab resolves into this list by `fileId`.
  const photoGallery = useMemo(() => {
    const items: Array<{
      fileId: string;
      thumbnailFileId: string | null;
      noteId: string;
      title: string;
      cacheKey: string;
    }> = [];
    for (const entry of timelineItems) {
      if (!entry.attachments) continue;
      const noteId = entry.id ?? entry.attachments[0]?.fileId ?? 'unknown';
      for (const att of entry.attachments) {
        if (!att.fileId) continue;
        items.push({
          fileId: att.fileId,
          thumbnailFileId: att.thumbnailFileId ?? null,
          noteId,
          title: entry.text?.trim() || 'Photo',
          cacheKey: att.fileId,
        });
      }
    }
    return items;
  }, [timelineItems]);

  const openPhoto = useCallback(
    (fileId: string) => {
      const idx = photoGallery.findIndex((p) => p.fileId === fileId);
      setPhotoPreviewIndex(idx >= 0 ? idx : 0);
    },
    [photoGallery],
  );

  const closePhoto = useCallback(() => setPhotoPreviewIndex(null), []);

  // Locally-owned empty report seeded when the user opens Edit without
  // a generated report ("Edit manually" path). Kept separate from
  // `onSetReport` so the lazy-init never triggers the route's dirty
  // flag — only typing in the form should count as a user edit.
  const [localSeed, setLocalSeed] = useState<GeneratedSiteReport | null>(null);
  // The report visible to the Edit tab: prefer the authoritative
  // prop (server/AI) then the locally-seeded blank.
  const effectiveReport = report ?? localSeed;

  const addNote = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onAddTextNote?.(trimmed);
    setInput('');
  }, [input, onAddTextNote]);

  const confirmDelete = useCallback(() => {
    if (deleteIndex === null) return;
    const note = notes[deleteIndex];
    setDeleteIndex(null);
    if (note && onDeleteNote) {
      onDeleteNote(note, deleteIndex);
    }
  }, [deleteIndex, notes, onDeleteNote]);

  // Direct delete used by the shared NoteOptionsSheet, which already
  // shows its own destructive confirmation stage and therefore
  // bypasses the legacy `deleteIndex` two-step.
  const deleteAt = useCallback(
    (sourceIndex: number) => {
      const note = timelineItems[sourceIndex];
      if (!note || !onDeleteNote) return;
      onDeleteNote(note, sourceIndex);
      if (
        note.source === 'voice' &&
        note.id &&
        voicePipeline.state.note?.id === note.id
      ) {
        voicePipeline.reset();
      }
      cancelImageAttachmentJobs(
        note,
        photoUploads.cancel,
        photoUploads.fileIdToAttachmentKey,
      );
    },
    [timelineItems, onDeleteNote, voicePipeline, photoUploads],
  );

  const updateNote = useCallback(
    (sourceIndex: number, nextBody: string) => {
      const note = notes[sourceIndex];
      if (!note || !onUpdateNote) return;
      const trimmed = nextBody.trim();
      if (!trimmed || trimmed === note.text) return;
      onUpdateNote(note, sourceIndex, trimmed);
    },
    [notes, onUpdateNote],
  );

  const openEdit = useCallback(() => {
    if (isGeneratingReport) return;
    // Lazy-seed locally so the route's dirty flag stays clean.
    if (!report) setLocalSeed(createEmptyReport());
    setActiveTab('edit');
  }, [isGeneratingReport, report]);

  const editManually = useCallback(() => {
    if (isGeneratingReport) return;
    if (onEditManually) {
      onEditManually();
      return;
    }
    if (!report) setLocalSeed(createEmptyReport());
    setActiveTab('edit');
  }, [isGeneratingReport, onEditManually, report]);

  const setReport = useCallback(
    (next: GeneratedSiteReport) => {
      if (isGeneratingReport) return;
      onSetReport?.(next);
    },
    [isGeneratingReport, onSetReport],
  );

  const handlePickAttachment = useCallback(
    (category: 'image' | 'document') => {
      onPickAttachment?.(category);
    },
    [onPickAttachment],
  );

  const handleRegenerate = useCallback(() => {
    setActiveTab('report');
    onRegenerate?.();
  }, [onRegenerate]);

  const handleFinalize = useCallback(() => {
    onFinalize?.();
  }, [onFinalize]);

  const handleOpenFile = useCallback(
    (fileId: string) => {
      onOpenFile?.(fileId);
    },
    [onOpenFile],
  );

  const value = useMemo<GenerateReportContextValue>(
    () => ({
      project,
      reportNumber,
      reportTitle:
        reportTitle?.trim() ||
        (reportNumber !== null ? `Report #${reportNumber}` : 'New report'),
      notes: {
        list: timelineItems,
        totalCount: timelineItems.length,
        // `rows` is the legacy ReportPhotos input — the timeline above
        // (`list`) is now the canonical photo source, so this stays
        // null on the draft path. Saved reports populate `rows` via
        // their own provider wrapper.
        rows: null,
        input,
        setInput,
        add: addNote,
        deleteIndex,
        setDeleteIndex,
        confirmDelete,
        deleteAt,
        canEdit: Boolean(onUpdateNote),
        update: updateNote,
      },
      tabs: {
        active: activeTab,
        set: setActiveTab,
        openEdit,
        editManually,
      },
      timeline: {
        items: timelineItems,
        isLoading: notesLoading,
      },
      generation: {
        report: effectiveReport,
        setReport,
        isUpdating: isGeneratingReport,
        error: generationError,
        errorActionLabel: generationErrorActionLabel ?? 'Retry',
        errorAction: onGenerationErrorAction ?? handleRegenerate,
        notesSinceLastGeneration,
        needsRegeneration,
        hasReport: report !== null,
        lastGeneration,
      },
      draft: {
        isFinalizing,
        isFinalizeConfirmVisible,
        setIsFinalizeConfirmVisible,
        finalizeError,
        finalize: handleFinalize,
        isAutoSaving,
        lastSavedAt,
      },
      // Phase H: inline WhatsApp-style recorder lives in the input
      // bar. `start()` arms the recorder (and surfaces the
      // permission dialog if needed); `stopAndSend()` finalises and
      // hands off to `useVoiceNotePipeline`; `cancel()` discards.
      voice: {
        isRecording: inlineRecorder.isRecording,
        snapshot: inlineRecorder.snapshot,
        historyBars: inlineRecorder.historyBars,
        interimTranscript: '',
        speechError: null,
        start: handleVoiceStart,
        stopAndSend: handleVoiceStopAndSend,
        cancel: handleVoiceCancel,
        onMaxDuration: handleVoiceMaxDuration,
        pipeline: reportId
          ? { step: voicePipeline.state.step, error: voicePipeline.state.error }
          : null,
        retry: handleRetryVoice,
      },
      // Photo button wires through to the route-supplied handler so the
      // route can push the camera modal + drain results on return. The
      // attachment-sheet pickers (image/document) still route through
      // `handlePickAttachment` for menu callers.
      photo: {
        handleCameraCapture: () => onCameraCapture?.(),
        handleMenuPick: (category) => onPickAttachment?.(category),
        retryUpload: photoUploads.retry,
        cancelUpload: photoUploads.cancel,
      },
      preview: {
        openFile: handleOpenFile,
        photoGallery,
        photoIndex: photoPreviewIndex,
        openPhoto,
        closePhoto,
      },
      placement: {
        onPlacePhotoGroup,
        canPlacePhotoGroup: Boolean(onPlacePhotoGroup) && !isGeneratingReport,
      },
      ui: {
        attachmentSheetVisible,
        setAttachmentSheetVisible,
        fileUploadError,
        setFileUploadError,
      },
      members: memberNames ?? EMPTY_MEMBERS,
      handlePickAttachment,
      handleRegenerate,
    }),
    [
      project,
      reportNumber,
      reportTitle,
      notes,
      notesLoading,
      input,
      addNote,
      deleteIndex,
      confirmDelete,
      deleteAt,
      updateNote,
      onUpdateNote,
      activeTab,
      openEdit,
      editManually,
      report,
      effectiveReport,
      localSeed,
      setReport,
      isGeneratingReport,
      generationError,
      generationErrorActionLabel,
      onGenerationErrorAction,
      lastGeneration,
      notesSinceLastGeneration,
      needsRegeneration,
      isFinalizing,
      isFinalizeConfirmVisible,
      finalizeError,
      handleFinalize,
      isAutoSaving,
      lastSavedAt,
      attachmentSheetVisible,
      fileUploadError,
      inlineRecorder.isRecording,
      inlineRecorder.snapshot,
      inlineRecorder.historyBars,
      inlineRecorder.permission,
      inlineRecorder.error,
      handleVoiceStart,
      handleVoiceStopAndSend,
      handleVoiceCancel,
      handleVoiceMaxDuration,
      reportId,
      voicePipeline.state.step,
      voicePipeline.state.error,
      handleRetryVoice,
      timelineItems,
      memberNames,
      handlePickAttachment,
      handleRegenerate,
      handleOpenFile,
      photoGallery,
      photoPreviewIndex,
      openPhoto,
      closePhoto,
      onCameraCapture,
      onPickAttachment,
      onPlacePhotoGroup,
      photoUploads.retry,
      photoUploads.cancel,
    ],
  );

  return (
    <GenerateReportContext.Provider value={value}>
      {children}
      {/*
        Phase H: permission-denied dialog. Replaces the modal's
        embedded permission gate now that recording is inline.
        Honours AGENTS.md hard rule #4 — no Alert.alert (Pitfall 12).
      */}
      <AppDialogSheet
        visible={inlineRecorder.permission === 'denied'}
        title="Microphone access needed"
        message="Enable microphone access in Settings to record voice notes."
        noticeTone="warning"
        onClose={inlineRecorder.dismissError}
        actions={[
          {
            label: 'Close',
            onPress: inlineRecorder.dismissError,
            variant: 'secondary',
            testID: 'voice-perm-close',
          },
        ]}
      />
      <AppDialogSheet
        visible={inlineRecorder.error !== null}
        title="Recording failed"
        message={
          inlineRecorder.error !== null
            ? inlineRecorder.userErrorMessage ?? RECORDER_START_FAILED_MESSAGE
            : undefined
        }
        noticeTone="danger"
        onClose={inlineRecorder.dismissError}
        actions={[
          {
            label: 'Dismiss',
            onPress: inlineRecorder.dismissError,
            variant: 'secondary',
            testID: 'voice-error-dismiss',
          },
        ]}
      />
      {/*
        Phase H+: hard-stop notice. Fires when the inline recorder
        auto-sends at `MAX_DURATION_MS` so the user understands their
        note wasn't silently truncated (see HARPA-PRO-D — Groq Whisper
        rejects oversized files, and the 15 min cap keeps us under
        Groq's 25 MB free-tier ceiling).
      */}
      <AppDialogSheet
        visible={maxDurationDialogVisible}
        title="Maximum recording reached"
        message={`Voice notes are capped at ${maxDurationMin} minutes. Your recording was sent automatically.`}
        noticeTone="info"
        onClose={dismissMaxDurationDialog}
        actions={[
          {
            label: 'OK',
            onPress: dismissMaxDurationDialog,
            variant: 'secondary',
            testID: 'voice-max-duration-ok',
          },
        ]}
      />
      {/*
        Phase 3 (usage limits): when the voice aggregator returns 403
        usage_limit_exceeded the pipeline state carries the structured
        details. Surface it through the themed dialog (no Alert.alert,
        hard rule #4). Calling `voicePipeline.reset()` clears both the
        failed state and the usageLimit slot, so the user can dismiss
        and retry once their quota resets.
      */}
      <UsageLimitDialog
        visible={voicePipeline.state.usageLimit !== null}
        details={voicePipeline.state.usageLimit}
        onClose={voicePipeline.reset}
      />
    </GenerateReportContext.Provider>
  );
}
