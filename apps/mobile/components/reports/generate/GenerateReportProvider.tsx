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

import type { TabKey } from './tabs';
import type { NoteEntry } from '@/lib/note-entry';
import type { GeneratedSiteReport } from '@harpa/report-core';

/**
 * Props passed to `GenerateReportProvider`. Route wrappers wire real
 * data (eventually from `useReportQuery` + `useReportNotesQuery`); dev
 * mirrors + tests pass canned values.
 */
export interface GenerateReportProviderProps {
  projectSlug: string;
  reportNumber: number | null;
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
  /** Count of notes added since the last successful generation. */
  notesSinceLastGeneration?: number;
  /** Called when the user taps Retry / Regenerate. */
  onRegenerate?: () => void;
  /**
   * Called when the user taps "Edit manually" on the empty Report
   * tab. Defaults to switching the active tab to `edit`.
   */
  onEditManually?: () => void;
  /** True while finalize is in flight. */
  isFinalizing?: boolean;
  /** Latest finalize error, or `null`. */
  finalizeError?: Error | string | null;
  /** Called when the user taps a file/image in the timeline or report. */
  onOpenFile?: (fileId: string) => void;
  /** Initial tab the screen opens on. Defaults to `notes`. */
  initialTab?: TabKey;
  children: ReactNode;
}

interface VoiceSurface {
  isRecording: boolean;
  amplitude: number;
  interimTranscript: string;
  speechError: string | null;
  toggleRecording: () => void;
  cancelRecording: () => void;
}

interface PhotoSurface {
  handleCameraCapture: () => Promise<void> | void;
  handleMenuPick: (
    category: 'image' | 'document',
  ) => Promise<void> | void;
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
  /** True while the AI generation request is in flight. */
  isUpdating: boolean;
  /** Latest generation error, or `null`. */
  error: string | null;
  /** Count of notes added since the last successful generation. */
  notesSinceLastGeneration: number;
  /** True once a report has been generated at least once. */
  hasReport: boolean;
}

interface DraftSurface {
  /** True while finalize is in flight. */
  isFinalizing: boolean;
  /** Opens the finalize-confirm dialog. */
  setIsFinalizeConfirmVisible: (visible: boolean) => void;
  isFinalizeConfirmVisible: boolean;
  /** Latest finalize error, or `null`. */
  finalizeError: Error | string | null;
}

interface PreviewSurface {
  /** Open a file from the timeline / report. No-op default. */
  openFile: (fileId: string) => void;
}

export interface GenerateReportContextValue {
  projectSlug: string;
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

export function GenerateReportProvider({
  projectSlug,
  reportNumber,
  notes,
  notesLoading = false,
  onAddTextNote,
  memberNames,
  reportTitle,
  report = null,
  isGeneratingReport = false,
  generationError = null,
  notesSinceLastGeneration = 0,
  onRegenerate,
  onEditManually,
  isFinalizing = false,
  finalizeError = null,
  onOpenFile,
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

  const addNote = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onAddTextNote?.(trimmed);
    setInput('');
  }, [input, onAddTextNote]);

  const confirmDelete = useCallback(() => {
    // TODO(P3.8): wire useReportNotesMutations().remove once the
    // persistence hooks land. For now the dialog just closes.
    setDeleteIndex(null);
  }, []);

  const openEdit = useCallback(() => {
    setActiveTab('edit');
  }, []);

  const editManually = useCallback(() => {
    if (onEditManually) {
      onEditManually();
    } else {
      setActiveTab('edit');
    }
  }, [onEditManually]);

  const handlePickAttachment = useCallback(
    (_category: 'image' | 'document') => {
      // TODO(P3.8): route to usePhotoUploadPipeline().handleMenuPick.
    },
    [],
  );

  const handleRegenerate = useCallback(() => {
    setActiveTab('report');
    onRegenerate?.();
  }, [onRegenerate]);

  const handleOpenFile = useCallback(
    (fileId: string) => {
      onOpenFile?.(fileId);
    },
    [onOpenFile],
  );

  const value = useMemo<GenerateReportContextValue>(
    () => ({
      projectSlug,
      reportNumber,
      reportTitle: reportTitle?.trim() || 'New Report',
      notes: {
        list: notes,
        totalCount: notes.length,
        // TODO(P3.8): expose real note rows once `useLocalReportNotes`
        // lands. ReportPhotos consumes this; passing `null` keeps the
        // surface stable.
        rows: null,
        input,
        setInput,
        add: addNote,
        deleteIndex,
        setDeleteIndex,
        confirmDelete,
      },
      tabs: {
        active: activeTab,
        set: setActiveTab,
        openEdit,
        editManually,
      },
      timeline: {
        items: notes,
        isLoading: notesLoading,
      },
      generation: {
        report,
        isUpdating: isGeneratingReport,
        error: generationError,
        notesSinceLastGeneration,
        hasReport: report !== null,
      },
      draft: {
        isFinalizing,
        isFinalizeConfirmVisible,
        setIsFinalizeConfirmVisible,
        finalizeError,
      },
      // TODO(P3.8): replace with real `useVoiceNotePipeline` surface.
      voice: {
        isRecording: false,
        amplitude: 0,
        interimTranscript: '',
        speechError: null,
        toggleRecording: () => undefined,
        cancelRecording: () => undefined,
      },
      // TODO(P3.8): replace with real `usePhotoUploadPipeline` surface.
      photo: {
        handleCameraCapture: () => undefined,
        handleMenuPick: () => undefined,
      },
      preview: {
        openFile: handleOpenFile,
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
      projectSlug,
      reportNumber,
      reportTitle,
      notes,
      notesLoading,
      input,
      addNote,
      deleteIndex,
      confirmDelete,
      activeTab,
      openEdit,
      editManually,
      report,
      isGeneratingReport,
      generationError,
      notesSinceLastGeneration,
      isFinalizing,
      isFinalizeConfirmVisible,
      finalizeError,
      attachmentSheetVisible,
      fileUploadError,
      memberNames,
      handlePickAttachment,
      handleRegenerate,
      handleOpenFile,
    ],
  );

  return (
    <GenerateReportContext.Provider value={value}>
      {children}
    </GenerateReportContext.Provider>
  );
}
