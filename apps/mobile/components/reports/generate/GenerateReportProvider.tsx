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
   * route wrapper is responsible for the actual mutation (P3.7+); the
   * provider just hands the trimmed body up.
   */
  onAddTextNote?: (body: string) => void;
  /** user_id → display name lookup for note author bylines. */
  memberNames?: ReadonlyMap<string, string>;
  /** Report title for the header. `null` falls back to "New Report". */
  reportTitle?: string | null;
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
   * lazily seeds an empty report when the user opens Edit. P3.6 no-ops
   * (no report state yet) and just switches the active tab.
   */
  openEdit: () => void;
}

interface TimelineSurface {
  /** Items used by the timeline list. P3.6 = text notes only. */
  items: readonly NoteEntry[];
  isLoading: boolean;
}

interface GenerationSurface {
  /** True while the AI generation request is in flight. P3.7. */
  isUpdating: boolean;
  /** Count of notes added since the last successful generation. P3.7. */
  notesSinceLastGeneration: number;
  /** True once a report has been generated at least once. P3.7. */
  hasReport: boolean;
}

interface DraftSurface {
  /** True while finalize is in flight. P3.7. */
  isFinalizing: boolean;
  /** Opens the finalize-confirm dialog. P3.7. */
  setIsFinalizeConfirmVisible: (visible: boolean) => void;
  isFinalizeConfirmVisible: boolean;
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
  ui: UISurface;
  members: ReadonlyMap<string, string>;
  /** Bubbled up by the Notes input + attachment sheet. P3.7+ wires uploads. */
  handlePickAttachment: (category: 'image' | 'document') => void;
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
  children,
}: GenerateReportProviderProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('notes');
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
    // TODO(P3.7): wire useReportNotesMutations().remove once the
    // persistence hooks land. For now the dialog just closes.
    setDeleteIndex(null);
  }, []);

  const openEdit = useCallback(() => {
    setActiveTab('edit');
  }, []);

  const handlePickAttachment = useCallback(
    (_category: 'image' | 'document') => {
      // TODO(P3.7): route to usePhotoUploadPipeline().handleMenuPick.
    },
    [],
  );

  const value = useMemo<GenerateReportContextValue>(
    () => ({
      projectSlug,
      reportNumber,
      reportTitle: reportTitle?.trim() || 'New Report',
      notes: {
        list: notes,
        totalCount: notes.length,
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
      },
      timeline: {
        items: notes,
        isLoading: notesLoading,
      },
      // TODO(P3.7): replace with real `useReportGeneration` surface.
      generation: {
        isUpdating: false,
        notesSinceLastGeneration: 0,
        hasReport: false,
      },
      // TODO(P3.7): replace with real `useReportDraftPersistence` surface.
      draft: {
        isFinalizing: false,
        isFinalizeConfirmVisible,
        setIsFinalizeConfirmVisible,
      },
      // TODO(P3.7): replace with real `useVoiceNotePipeline` surface.
      voice: {
        isRecording: false,
        amplitude: 0,
        interimTranscript: '',
        speechError: null,
        toggleRecording: () => undefined,
        cancelRecording: () => undefined,
      },
      // TODO(P3.7): replace with real `usePhotoUploadPipeline` surface.
      photo: {
        handleCameraCapture: () => undefined,
        handleMenuPick: () => undefined,
      },
      ui: {
        attachmentSheetVisible,
        setAttachmentSheetVisible,
        fileUploadError,
        setFileUploadError,
      },
      members: memberNames ?? EMPTY_MEMBERS,
      handlePickAttachment,
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
      isFinalizeConfirmVisible,
      attachmentSheetVisible,
      fileUploadError,
      memberNames,
      handlePickAttachment,
    ],
  );

  return (
    <GenerateReportContext.Provider value={value}>
      {children}
    </GenerateReportContext.Provider>
  );
}
