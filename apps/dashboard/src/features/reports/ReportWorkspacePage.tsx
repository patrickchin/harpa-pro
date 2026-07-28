import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { projects, reports } from '@harpa/api-contract';

import { Modal } from '@/components/modal';

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
import './reports.css';

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
    <span
      className={`reports-badge ${
        report.status === 'finalized' ? 'reports-badge--finalized' : 'reports-badge--draft'
      }`}
    >
      {report.status === 'finalized' ? 'Finalized' : 'Draft'}
    </span>
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
      backdropClassName="reports-dialog-backdrop"
      closeOnEscape={!isPending}
      dialogClassName="reports-dialog"
      onClose={onCancel}
      role="alertdialog"
    >
      <h2 id="report-confirmation-title">{copy.title}</h2>
      <p id="report-confirmation-description">{copy.body}</p>
      <div className="reports-dialog__actions">
        <button
          type="button"
          className="reports-button reports-button--secondary"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </button>
        <button
          type="button"
          className={
            copy.danger
              ? 'reports-button reports-button--danger-solid'
              : 'reports-button reports-button--primary'
          }
          onClick={onConfirm}
          disabled={isPending}
        >
          {copy.confirm}
        </button>
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
      <section className="reports-workspace reports-empty-state">
        <h1>Couldn&apos;t load Site Visit #{reportNumber}</h1>
        <p>{errorMessage(reportQuery.error)}</p>
        <button
          type="button"
          className="reports-button reports-button--secondary"
          onClick={() => void reportQuery.refetch()}
        >
          Retry report
        </button>
      </section>
    );
  }

  if (reportQuery.isLoading || !report || !localBody || !saveState) {
    return (
      <section className="reports-workspace reports-loading" aria-busy="true">
        <p role="status">Loading report workspace…</p>
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
    <section className="reports-workspace" aria-labelledby="report-title">
      <header className="reports-workspace-header">
        <div className="reports-workspace-header__context">
          <span>Site Visit #{report.number}</span>
          <ReportBadge report={report} />
          {report.needsRegeneration ? (
            <span className="reports-badge reports-badge--attention">Needs update</span>
          ) : null}
          {report.status === 'draft' ? (
            <span
              className={`reports-save-status reports-save-status--${saveState.status}`}
              role="status"
            >
              {saveStateText(saveState)}
            </span>
          ) : null}
        </div>
        <h1 id="report-title">{displayReportTitle(localBody)}</h1>
        <div className="reports-workspace-header__actions">
          {report.status === 'draft' && canWrite ? (
            <>
              <button
                type="button"
                className="reports-button reports-button--secondary"
                onClick={() => generateMutation.mutate()}
                disabled={
                  saveState.status !== 'saved' ||
                  generateMutation.isPending ||
                  finalizeMutation.isPending
                }
              >
                {generateMutation.isPending
                  ? 'Updating report…'
                  : report.body || report.generatedAt
                    ? 'Update report'
                    : 'Generate report'}
              </button>
              {role === 'owner' ? (
                <button
                  type="button"
                  className="reports-button reports-button--primary"
                  disabled={!finalizeEnabled}
                  onClick={() => setConfirmation('finalize')}
                >
                  Finalize
                </button>
              ) : null}
              {saveState.status === 'failed' ? (
                <button
                  type="button"
                  className="reports-button reports-button--secondary"
                  onClick={() => void save()}
                >
                  Retry save
                </button>
              ) : null}
              <button
                type="button"
                className="reports-button reports-button--quiet reports-button--danger"
                onClick={() => setConfirmation('delete')}
              >
                Delete report
              </button>
            </>
          ) : null}
          {report.status === 'finalized' ? (
            <>
              <button
                type="button"
                className="reports-button reports-button--primary"
                onClick={() => pdfMutation.mutate()}
                disabled={pdfMutation.isPending}
              >
                {pdfMutation.isPending ? 'Preparing PDF…' : 'Download PDF'}
              </button>
              <button
                type="button"
                className="reports-button reports-button--secondary"
                onClick={() => void copyLink()}
              >
                Copy link
              </button>
              {canWrite ? (
                <>
                  <button
                    type="button"
                    className="reports-button reports-button--secondary"
                    onClick={() => setConfirmation('reopen')}
                  >
                    Reopen as draft
                  </button>
                  <button
                    type="button"
                    className="reports-button reports-button--quiet reports-button--danger"
                    onClick={() => setConfirmation('delete')}
                  >
                    Delete report
                  </button>
                </>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            className="reports-button reports-button--quiet reports-preview-toggle"
            aria-pressed={previewVisible}
            onClick={() => setPreviewVisible((visible) => !visible)}
          >
            {previewVisible ? 'Hide preview' : 'Show preview'}
          </button>
        </div>
        {copyStatus ? <p role="status">{copyStatus}</p> : null}
      </header>

      {malformedBody ? (
        <div className="reports-inline-error" role="alert">
          This report body was malformed. A safe empty body is shown so the original payload is
          never edited accidentally.
        </div>
      ) : null}

      {conflictReport ? (
        <section
          className="reports-conflict"
          role="alert"
          aria-labelledby="report-conflict-heading"
        >
          <div>
            <h2 id="report-conflict-heading">This report changed on another device</h2>
            <p>
              Your browser draft is preserved. Reload the newer report or explicitly overwrite it
              with your draft.
            </p>
          </div>
          <div className="reports-row-actions">
            <button
              type="button"
              className="reports-button reports-button--secondary"
              onClick={reloadLatest}
            >
              Reload latest
            </button>
            <button
              type="button"
              className="reports-button reports-button--danger-solid"
              onClick={() => setConfirmation('overwrite')}
            >
              Overwrite with my draft
            </button>
          </div>
        </section>
      ) : null}

      {actionError && !conflictReport ? (
        <p className="reports-inline-error" role="alert">
          {errorMessage(actionError)}
        </p>
      ) : null}

      {report.status === 'finalized' ? (
        <>
          <div className="reports-tabs" role="tablist" aria-label="Report surfaces">
            <button
              type="button"
              role="tab"
              aria-selected={finalizedTab === 'report'}
              onClick={() => setFinalizedTab('report')}
            >
              Report
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={finalizedTab === 'review'}
              onClick={() => setFinalizedTab('review')}
            >
              Review
            </button>
          </div>
          {finalizedTab === 'report' ? (
            <div className="reports-finalized-grid">
              <ReportPreview body={previewBody} />
              <SourceNotesPanel
                api={api}
                notes={notesQuery.data?.items ?? []}
                isLoading={notesQuery.isLoading}
                error={notesQuery.error ?? null}
                onRetry={() => void notesQuery.refetch()}
              />
            </div>
          ) : (
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
          )}
        </>
      ) : canWrite ? (
        <>
          <div className="reports-draft-grid">
            <ReportBodyEditor body={localBody} onChange={changeBody} />
            {previewVisible ? (
              <div className="reports-preview-column">
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
        <div className="reports-finalized-grid">
          <div>
            <p className="reports-readonly-notice">You have read-only access to this draft.</p>
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
