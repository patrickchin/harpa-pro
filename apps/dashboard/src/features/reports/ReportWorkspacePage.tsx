import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { projects, reports } from '@harpa/api-contract';
import {
  Check,
  Download,
  Eye,
  EyeOff,
  Link as LinkIcon,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';

import { Modal } from '@/components/modal';
import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import { ReportConflictError, errorMessage, type ReportsApi } from './api';
import { filenameForReport } from './format';
import { coerceReportBody, displayReportTitle } from './report-body';
import { ReportBodyEditor } from './ReportBodyEditor';
import { ReportPreview } from './ReportPreview';
import { ReportReview } from './ReportReview';
import {
  canFinalizeReport,
  initialSaveState,
  saveStateReducer,
  saveStateText,
  type SaveState,
  type SaveStateEvent,
} from './save-state';
import { SourceNotesPanel } from './SourceNotesPanel';

interface StoredDraft {
  body: reports.ReportBody;
  baseUpdatedAt: string;
  storedAt: string;
}

type Confirmation = 'overwrite' | 'finalize' | 'reopen' | 'delete' | null;
type FinalizedTab = 'report' | 'review';

export function reportDraftStorageKey(projectSlug: string, reportNumber: number): string {
  return `harpa:dashboard:report-draft:${projectSlug}:${reportNumber}`;
}

function readStoredDraft(key: string): StoredDraft | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredDraft>;
    const body = coerceReportBody(value.body, null);
    if (
      body.malformed ||
      typeof value.baseUpdatedAt !== 'string' ||
      typeof value.storedAt !== 'string'
    ) {
      sessionStorage.removeItem(key);
      return null;
    }
    return {
      body: body.body,
      baseUpdatedAt: value.baseUpdatedAt,
      storedAt: value.storedAt,
    };
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

function storeDraft(key: string, body: reports.ReportBody, baseUpdatedAt: string) {
  const stored: StoredDraft = {
    body,
    baseUpdatedAt,
    storedAt: new Date().toISOString(),
  };
  sessionStorage.setItem(key, JSON.stringify(stored));
}

function defaultDownload(url: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
}

function ReportBadge({ report }: { report: reports.Report }) {
  return (
    <Badge tone={report.status === 'finalized' ? 'success' : 'info'}>
      {report.status === 'finalized' ? 'Finalized' : 'Draft'}
    </Badge>
  );
}

function ConfirmationDialog({
  confirmation,
  reportNumber,
  isPending,
  onCancel,
  onConfirm,
}: {
  confirmation: Exclude<Confirmation, null>;
  reportNumber: number;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const copy = {
    overwrite: {
      title: 'Replace the newer server copy?',
      body: 'Your browser draft will replace the version saved by the other device. The newer server copy cannot be merged automatically.',
      confirm: 'Confirm overwrite',
      danger: true,
    },
    finalize: {
      title: `Finalize Site Visit #${reportNumber}?`,
      body: 'The report will become read-only and the Review discussion will become available.',
      confirm: 'Confirm finalize',
      danger: false,
    },
    reopen: {
      title: `Reopen Site Visit #${reportNumber} as a draft?`,
      body: 'Review will be unavailable until this report is finalized again. Existing comments remain stored.',
      confirm: 'Confirm reopen',
      danger: false,
    },
    delete: {
      title: `Delete Site Visit #${reportNumber}?`,
      body: 'This permanently removes the report, source notes, review comments, and attached report records.',
      confirm: 'Confirm delete',
      danger: true,
    },
  }[confirmation];

  return (
    <Modal
      ariaDescribedBy="report-confirmation-description"
      ariaLabelledBy="report-confirmation-title"
      closeOnEscape={!isPending}
      initialFocusRef={cancelButtonRef}
      onClose={onCancel}
      role="alertdialog"
    >
      <h2 className="text-title-sm font-bold tracking-tight" id="report-confirmation-title">
        {copy.title}
      </h2>
      <p className="mt-3 text-body text-muted-foreground" id="report-confirmation-description">
        {copy.body}
      </p>
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          ref={cancelButtonRef}
          variant="secondary"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          variant={copy.danger ? 'danger-solid' : 'primary'}
          onClick={onConfirm}
          disabled={isPending}
        >
          {copy.confirm}
        </Button>
      </div>
    </Modal>
  );
}

export interface ReportWorkspacePageProps {
  api: ReportsApi;
  projectSlug: string;
  reportNumber: number;
  role: projects.ProjectRole;
  autosaveDelayMs?: number;
  draftPersistenceDelayMs?: number;
  onDownloadPdf?: (url: string, filename: string) => void;
  onDeleted?: () => void;
}

export function ReportWorkspacePage({
  api,
  projectSlug,
  reportNumber,
  role,
  autosaveDelayMs = 700,
  draftPersistenceDelayMs = 250,
  onDownloadPdf = defaultDownload,
  onDeleted,
}: ReportWorkspacePageProps) {
  const queryClient = useQueryClient();
  const reportKey = useMemo(
    () => ['dashboard', 'report', projectSlug, reportNumber] as const,
    [projectSlug, reportNumber],
  );
  const storageKey = reportDraftStorageKey(projectSlug, reportNumber);
  const canWrite = role === 'owner' || role === 'editor';
  const [localBody, setLocalBody] = useState<reports.ReportBody | null>(null);
  const deferredBody = useDeferredValue(localBody);
  const localBodyRef = useRef<reports.ReportBody | null>(null);
  const [malformedBody, setMalformedBody] = useState(false);
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const saveStateRef = useRef<SaveState | null>(null);
  const [conflictReport, setConflictReport] = useState<reports.Report | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [finalizedTab, setFinalizedTab] = useState<FinalizedTab>('report');
  const [previewVisible, setPreviewVisible] = useState(true);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const initializedReportId = useRef<string | null>(null);
  const savePromiseRef = useRef<Promise<void> | null>(null);

  const reportQuery = useQuery({
    queryKey: reportKey,
    queryFn: ({ signal }) => api.getReport(projectSlug, reportNumber, signal),
  });
  const report = reportQuery.data;

  const notesQuery = useQuery({
    queryKey: ['dashboard', 'report-notes', report?.id ?? null],
    queryFn: ({ signal }) => api.listNotes(report!.id, signal),
    enabled: Boolean(report?.id),
  });

  const commentsKey = useMemo(
    () => ['dashboard', 'report-comments', projectSlug, reportNumber] as const,
    [projectSlug, reportNumber],
  );
  const commentsQuery = useQuery({
    queryKey: commentsKey,
    queryFn: ({ signal }) => api.listComments(projectSlug, reportNumber, signal),
    enabled: report?.status === 'finalized',
  });

  const transition = useCallback((event: SaveStateEvent) => {
    setSaveState((current) => {
      if (!current) return current;
      const next = saveStateReducer(current, event);
      saveStateRef.current = next;
      return next;
    });
  }, []);

  const setKnownSaveState = useCallback((next: SaveState) => {
    saveStateRef.current = next;
    setSaveState(next);
  }, []);

  const setKnownBody = useCallback((next: reports.ReportBody) => {
    localBodyRef.current = next;
    setLocalBody(next);
  }, []);

  const updateCachedReport = useCallback(
    (next: reports.Report) => {
      queryClient.setQueryData(reportKey, next);
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', 'project-reports', projectSlug],
      });
    },
    [projectSlug, queryClient, reportKey],
  );

  useEffect(() => {
    if (!report || initializedReportId.current === report.id) return;
    initializedReportId.current = report.id;
    const coerced = coerceReportBody(report.body, report.visitDate);
    const stored = readStoredDraft(storageKey);
    setMalformedBody(coerced.malformed);
    setFinalizedTab('report');

    if (stored && report.status === 'draft' && canWrite) {
      setKnownBody(stored.body);
      if (stored.baseUpdatedAt !== report.updatedAt) {
        setConflictReport(report);
        setKnownSaveState({
          status: 'conflict',
          updatedAt: stored.baseUpdatedAt,
          currentUpdatedAt: report.updatedAt,
        });
      } else {
        setKnownSaveState({
          status: 'dirty',
          updatedAt: stored.baseUpdatedAt,
        });
      }
      return;
    }

    setKnownBody(coerced.body);
    setConflictReport(null);
    setKnownSaveState(initialSaveState(report.updatedAt));
  }, [canWrite, report, setKnownBody, setKnownSaveState, storageKey]);

  const preserveDraft = useCallback(() => {
    const body = localBodyRef.current;
    const state = saveStateRef.current;
    if (body && state && state.status !== 'saved') {
      storeDraft(storageKey, body, state.updatedAt);
    }
  }, [storageKey]);

  useEffect(() => {
    window.addEventListener('pagehide', preserveDraft);
    return () => window.removeEventListener('pagehide', preserveDraft);
  }, [preserveDraft]);

  const handleConflict = useCallback(
    (caught: unknown) => {
      if (!(caught instanceof ReportConflictError)) return false;
      preserveDraft();
      setConflictReport(caught.currentReport);
      transition({
        type: 'conflict',
        currentUpdatedAt: caught.currentReport.updatedAt,
      });
      return true;
    },
    [preserveDraft, transition],
  );

  const save = useCallback(
    (options?: { expectedUpdatedAt?: string; allowConflict?: boolean }) => {
      if (savePromiseRef.current) return savePromiseRef.current;
      const body = localBodyRef.current;
      const state = saveStateRef.current;
      if (!body || !state || !canWrite || report?.status !== 'draft') {
        return Promise.resolve();
      }
      if (state.status === 'conflict' && !options?.allowConflict) {
        return Promise.resolve();
      }
      if (state.status === 'saved' && options?.expectedUpdatedAt === undefined) {
        return Promise.resolve();
      }

      const bodySnapshot = body;
      const expectedUpdatedAt = options?.expectedUpdatedAt ?? state.updatedAt;
      const savingState: SaveState = {
        status: 'saving',
        updatedAt: expectedUpdatedAt,
      };
      setKnownSaveState(savingState);

      const promise = api
        .updateReport(projectSlug, reportNumber, {
          body: bodySnapshot,
          expectedUpdatedAt,
        })
        .then((updated) => {
          updateCachedReport(updated);
          setConflictReport(null);
          setConfirmation(null);
          if (localBodyRef.current === bodySnapshot) {
            sessionStorage.removeItem(storageKey);
            setKnownSaveState(initialSaveState(updated.updatedAt));
          } else {
            setKnownSaveState({
              status: 'dirty',
              updatedAt: updated.updatedAt,
            });
          }
        })
        .catch((caught: unknown) => {
          if (!handleConflict(caught)) {
            preserveDraft();
            transition({
              type: 'failed',
              message: errorMessage(caught, "Couldn't save report."),
            });
          }
        })
        .finally(() => {
          savePromiseRef.current = null;
        });
      savePromiseRef.current = promise;
      return promise;
    },
    [
      api,
      canWrite,
      handleConflict,
      preserveDraft,
      projectSlug,
      report?.status,
      reportNumber,
      setKnownSaveState,
      storageKey,
      transition,
      updateCachedReport,
    ],
  );

  useEffect(() => {
    if (saveState?.status !== 'dirty' || conflictReport) return;
    const timer = window.setTimeout(() => {
      void save();
    }, autosaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [autosaveDelayMs, conflictReport, localBody, save, saveState?.status]);

  useEffect(() => {
    if (
      !localBody ||
      !saveState ||
      saveState.status === 'saved' ||
      !canWrite ||
      report?.status !== 'draft'
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      storeDraft(storageKey, localBody, saveState.updatedAt);
    }, draftPersistenceDelayMs);
    return () => window.clearTimeout(timer);
  }, [canWrite, draftPersistenceDelayMs, localBody, report?.status, saveState, storageKey]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 's' || (!event.metaKey && !event.ctrlKey)) {
        return;
      }
      if (!canWrite || report?.status !== 'draft') return;
      event.preventDefault();
      void save();
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [canWrite, report?.status, save]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!report || !saveStateRef.current) {
        throw new Error('Report is not ready.');
      }
      const input = { expectedUpdatedAt: saveStateRef.current.updatedAt };
      return report.body || report.generatedAt
        ? api.updateGeneratedReport(projectSlug, reportNumber, input)
        : api.generateReport(projectSlug, reportNumber, input);
    },
    onSuccess: ({ report: updated }) => {
      updateCachedReport(updated);
      const coerced = coerceReportBody(updated.body, updated.visitDate);
      setKnownBody(coerced.body);
      setMalformedBody(coerced.malformed);
      setConflictReport(null);
      sessionStorage.removeItem(storageKey);
      setKnownSaveState(initialSaveState(updated.updatedAt));
    },
    onError: (caught) => {
      handleConflict(caught);
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!saveStateRef.current) throw new Error('Report is not ready.');
      return api.finalizeReport(projectSlug, reportNumber, {
        expectedUpdatedAt: saveStateRef.current.updatedAt,
      });
    },
    onSuccess: ({ report: updated }) => {
      updateCachedReport(updated);
      setFinalizedTab('report');
      setConfirmation(null);
      setKnownSaveState(initialSaveState(updated.updatedAt));
    },
    onError: (caught) => {
      setConfirmation(null);
      handleConflict(caught);
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async () => {
      if (!report) throw new Error('Report is not ready.');
      return api.reopenReport(projectSlug, reportNumber, {
        expectedUpdatedAt: report.updatedAt,
      });
    },
    onSuccess: ({ report: updated }) => {
      updateCachedReport(updated);
      const coerced = coerceReportBody(updated.body, updated.visitDate);
      setKnownBody(coerced.body);
      setMalformedBody(coerced.malformed);
      setFinalizedTab('report');
      setConfirmation(null);
      setKnownSaveState(initialSaveState(updated.updatedAt));
    },
    onError: (caught) => {
      setConfirmation(null);
      handleConflict(caught);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteReport(projectSlug, reportNumber),
    onSuccess: () => {
      sessionStorage.removeItem(storageKey);
      setConfirmation(null);
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', 'project-reports', projectSlug],
      });
      onDeleted?.();
    },
    onError: () => setConfirmation(null),
  });

  const pdfMutation = useMutation({
    mutationFn: () => api.renderPdf(projectSlug, reportNumber),
    onSuccess: ({ url }) => {
      onDownloadPdf(url, filenameForReport(displayReportTitle(report?.body ?? null)));
    },
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) => api.createComment(projectSlug, reportNumber, body),
    onSuccess: (comment) => {
      queryClient.setQueryData<{ items: reports.ReportComment[] }>(commentsKey, (current) => ({
        items: [...(current?.items ?? []), comment],
      }));
    },
  });

  const changeBody = (next: reports.ReportBody) => {
    setKnownBody(next);
    transition({ type: 'changed' });
  };

  const reloadLatest = () => {
    if (!conflictReport) return;
    const coerced = coerceReportBody(conflictReport.body, conflictReport.visitDate);
    updateCachedReport(conflictReport);
    setKnownBody(coerced.body);
    setMalformedBody(coerced.malformed);
    setConflictReport(null);
    setConfirmation(null);
    sessionStorage.removeItem(storageKey);
    setKnownSaveState(initialSaveState(conflictReport.updatedAt));
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyStatus('Report link copied');
    } catch {
      setCopyStatus("Couldn't copy report link");
    }
  };

  if (reportQuery.error) {
    return (
      <section
        className="grid min-h-72 min-w-0 place-items-center rounded-card-ui border border-border bg-card p-8 text-center shadow-raised-ui"
        data-testid="report-workspace"
      >
        <div className="max-w-reading space-y-4">
          <h1 className="text-title font-bold tracking-tight">
            Couldn&apos;t load Site Visit #{reportNumber}
          </h1>
          <p className="text-muted-foreground">{errorMessage(reportQuery.error)}</p>
          <Button variant="secondary" onClick={() => void reportQuery.refetch()}>
            Retry report
          </Button>
        </div>
      </section>
    );
  }

  if (reportQuery.isLoading || !report || !localBody || !saveState) {
    return (
      <section
        className="grid min-h-72 min-w-0 place-items-center text-muted-foreground"
        data-testid="report-workspace"
        aria-busy="true"
      >
        <p className="font-medium" role="status">
          Loading report workspace…
        </p>
      </section>
    );
  }

  const finalizeEnabled =
    report.status === 'draft' &&
    canFinalizeReport(role, saveState) &&
    !generateMutation.isPending &&
    !finalizeMutation.isPending;
  const actionError =
    generateMutation.error ??
    finalizeMutation.error ??
    reopenMutation.error ??
    deleteMutation.error ??
    pdfMutation.error;
  const previewBody = deferredBody ?? localBody;

  return (
    <section
      className="min-w-0 space-y-5 text-foreground"
      data-testid="report-workspace"
      aria-labelledby="report-title"
    >
      <header className="grid min-w-0 gap-4 border-b border-border pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-meta font-bold">
            <span>Site Visit #{report.number}</span>
            <ReportBadge report={report} />
            {report.needsRegeneration ? <Badge tone="warning">Needs update</Badge> : null}
            {report.status === 'draft' ? (
              <span
                className={cn(
                  'border-l border-border pl-3 text-meta font-medium text-muted-foreground',
                  saveState.status === 'failed' || saveState.status === 'conflict'
                    ? 'text-danger-text'
                    : null,
                )}
                role="status"
              >
                {saveStateText(saveState)}
              </span>
            ) : null}
          </div>
          <h1
            className="mt-2 max-w-content break-words text-title font-bold tracking-tight"
            id="report-title"
          >
            {displayReportTitle(localBody)}
          </h1>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center lg:justify-end">
          {report.status === 'draft' && canWrite ? (
            <>
              <Button
                className="w-full sm:w-auto"
                variant="secondary"
                onClick={() => generateMutation.mutate()}
                disabled={
                  saveState.status !== 'saved' ||
                  generateMutation.isPending ||
                  finalizeMutation.isPending
                }
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                {generateMutation.isPending
                  ? 'Updating report…'
                  : report.body || report.generatedAt
                    ? 'Update report'
                    : 'Generate report'}
              </Button>
              {role === 'owner' ? (
                <Button
                  className="w-full sm:w-auto"
                  disabled={!finalizeEnabled}
                  onClick={() => setConfirmation('finalize')}
                >
                  <Check aria-hidden="true" className="size-4" />
                  Finalize
                </Button>
              ) : null}
              {saveState.status === 'failed' ? (
                <Button
                  className="w-full sm:w-auto"
                  variant="secondary"
                  onClick={() => void save()}
                >
                  <RefreshCw aria-hidden="true" className="size-4" />
                  Retry save
                </Button>
              ) : null}
              <Button
                className="w-full sm:w-auto"
                variant="destructive"
                onClick={() => setConfirmation('delete')}
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Delete report
              </Button>
            </>
          ) : null}
          {report.status === 'finalized' ? (
            <>
              <Button
                className="w-full sm:w-auto"
                onClick={() => pdfMutation.mutate()}
                disabled={pdfMutation.isPending}
              >
                <Download aria-hidden="true" className="size-4" />
                {pdfMutation.isPending ? 'Preparing PDF…' : 'Download PDF'}
              </Button>
              <Button
                className="w-full sm:w-auto"
                variant="secondary"
                onClick={() => void copyLink()}
              >
                <LinkIcon aria-hidden="true" className="size-4" />
                Copy link
              </Button>
              {canWrite ? (
                <>
                  <Button
                    className="w-full sm:w-auto"
                    variant="secondary"
                    onClick={() => setConfirmation('reopen')}
                  >
                    <RotateCcw aria-hidden="true" className="size-4" />
                    Reopen as draft
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    variant="destructive"
                    onClick={() => setConfirmation('delete')}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Delete report
                  </Button>
                </>
              ) : null}
            </>
          ) : null}
          <Button
            className="w-full sm:w-auto xl:hidden"
            variant="quiet"
            aria-pressed={previewVisible}
            onClick={() => setPreviewVisible((visible) => !visible)}
          >
            {previewVisible ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
            {previewVisible ? 'Hide preview' : 'Show preview'}
          </Button>
        </div>
        {copyStatus ? (
          <p className="text-meta font-medium text-muted-foreground lg:col-span-2" role="status">
            {copyStatus}
          </p>
        ) : null}
      </header>

      {malformedBody ? (
        <div
          className="rounded-card-ui border border-danger-border bg-danger-soft px-4 py-3 text-danger-text"
          role="alert"
        >
          This report body was malformed. A safe empty body is shown so the original payload is
          never edited accidentally.
        </div>
      ) : null}

      {conflictReport ? (
        <section
          className="flex flex-wrap items-center justify-between gap-4 rounded-card-ui border border-danger-border bg-danger-soft px-4 py-4 text-danger-text lg:gap-x-8"
          role="alert"
          aria-labelledby="report-conflict-heading"
        >
          <div className="min-w-0 max-w-reading">
            <h2 className="text-title-sm font-bold tracking-tight" id="report-conflict-heading">
              This report changed on another device
            </h2>
            <p className="mt-1">
              Your browser draft is preserved. Reload the newer report or explicitly overwrite it
              with your draft.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button variant="secondary" onClick={reloadLatest}>
              Reload latest
            </Button>
            <Button variant="danger-solid" onClick={() => setConfirmation('overwrite')}>
              Overwrite with my draft
            </Button>
          </div>
        </section>
      ) : null}

      {actionError && !conflictReport ? (
        <p
          className="rounded-card-ui border border-danger-border bg-danger-soft px-4 py-3 text-danger-text"
          role="alert"
        >
          {errorMessage(actionError)}
        </p>
      ) : null}

      {report.status === 'finalized' ? (
        <TabGroup
          selectedIndex={finalizedTab === 'report' ? 0 : 1}
          onChange={(index) => setFinalizedTab(index === 0 ? 'report' : 'review')}
        >
          <TabList
            className="grid w-full grid-cols-2 gap-1 rounded-card-ui border border-border bg-card p-1 shadow-raised-ui sm:w-fit"
            aria-label="Report surfaces"
          >
            <Tab className="min-h-11 rounded-control-ui px-4 py-2.5 text-sm font-bold text-muted-foreground transition-colors data-[selected]:bg-primary data-[selected]:text-primary-foreground">
              Report
            </Tab>
            <Tab className="min-h-11 rounded-control-ui px-4 py-2.5 text-sm font-bold text-muted-foreground transition-colors data-[selected]:bg-primary data-[selected]:text-primary-foreground">
              Review
            </Tab>
          </TabList>
          <TabPanels className="mt-4 min-w-0">
            <TabPanel className="min-w-0 focus:outline-none">
              <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.8fr)]">
                <ReportPreview body={previewBody} />
                <SourceNotesPanel
                  api={api}
                  notes={notesQuery.data?.items ?? []}
                  isLoading={notesQuery.isLoading}
                  error={notesQuery.error ?? null}
                  onRetry={() => void notesQuery.refetch()}
                />
              </div>
            </TabPanel>
            <TabPanel className="min-w-0 focus:outline-none">
              <ReportReview
                comments={commentsQuery.data?.items ?? []}
                isLoading={commentsQuery.isLoading}
                error={commentsQuery.error ?? null}
                isSubmitting={commentMutation.isPending}
                onRetry={() => void commentsQuery.refetch()}
                onAddComment={async (body) => {
                  await commentMutation.mutateAsync(body);
                }}
              />
            </TabPanel>
          </TabPanels>
        </TabGroup>
      ) : canWrite ? (
        <>
          <div
            className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(20rem,1fr)]"
            data-testid="report-draft-layout"
          >
            <ReportBodyEditor body={localBody} onChange={changeBody} />
            {previewVisible ? (
              <div className="min-w-0 xl:sticky xl:top-5 xl:max-h-[calc(100vh-2.5rem)] xl:overflow-auto">
                <ReportPreview body={previewBody} />
              </div>
            ) : null}
          </div>
          <SourceNotesPanel
            api={api}
            notes={notesQuery.data?.items ?? []}
            isLoading={notesQuery.isLoading}
            error={notesQuery.error ?? null}
            onRetry={() => void notesQuery.refetch()}
          />
        </>
      ) : (
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.8fr)]">
          <div className="min-w-0 space-y-4">
            <p className="rounded-card-ui border border-info-border bg-info-soft px-4 py-3 text-info-text">
              You have read-only access to this draft.
            </p>
            <ReportPreview body={previewBody} />
          </div>
          <SourceNotesPanel
            api={api}
            notes={notesQuery.data?.items ?? []}
            isLoading={notesQuery.isLoading}
            error={notesQuery.error ?? null}
            onRetry={() => void notesQuery.refetch()}
          />
        </div>
      )}

      {confirmation ? (
        <ConfirmationDialog
          confirmation={confirmation}
          reportNumber={report.number}
          isPending={
            finalizeMutation.isPending ||
            reopenMutation.isPending ||
            deleteMutation.isPending ||
            saveState.status === 'saving'
          }
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            if (confirmation === 'overwrite' && conflictReport) {
              void save({
                expectedUpdatedAt: conflictReport.updatedAt,
                allowConflict: true,
              });
            } else if (confirmation === 'finalize') {
              finalizeMutation.mutate();
            } else if (confirmation === 'reopen') {
              reopenMutation.mutate();
            } else if (confirmation === 'delete') {
              deleteMutation.mutate();
            }
          }}
        />
      ) : null}
    </section>
  );
}
