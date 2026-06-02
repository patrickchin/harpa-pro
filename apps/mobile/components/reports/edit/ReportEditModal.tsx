/**
 * ReportEditModal — switches on `target` and mounts the correct body
 * inside `EditSectionSheet`. Centralises the seed/apply/delete plumbing
 * so each card only needs an `onEdit` callback that flips the modal on.
 */
import { useMemo } from 'react';
import type {
  GeneratedReportIssue,
  GeneratedReportMaterial,
  GeneratedReportSection,
  GeneratedReportWeather,
  GeneratedReportWorkers,
  GeneratedSiteReport,
} from '@harpa/report-core';

import type { GeneratedReportMeta } from '@/lib/reports/report-edit-helpers';

import { applyDelete, applyEdit, seedDraft } from './apply';
import { EditSectionSheet } from './EditSectionSheet';
import { EditIssueBody } from './bodies/EditIssueBody';
import { EditMaterialsBody } from './bodies/EditMaterialsBody';
import { EditMetaBody } from './bodies/EditMetaBody';
import { EditNextStepsBody } from './bodies/EditNextStepsBody';
import { EditSectionBody } from './bodies/EditSectionBody';
import { EditWeatherBody } from './bodies/EditWeatherBody';
import { EditWorkersBody } from './bodies/EditWorkersBody';
import type { ReportEditTarget } from './types';

export interface ReportEditModalProps {
  /** Target being edited. `null` keeps the modal closed. */
  target: ReportEditTarget | null;
  report: GeneratedSiteReport;
  onClose: () => void;
  onChange: (next: GeneratedSiteReport) => void;
}

const TITLES: Record<ReportEditTarget['kind'], string> = {
  meta: 'Summary & meta',
  weather: 'Weather',
  workers: 'Workers',
  materials: 'Materials',
  nextSteps: 'Next steps',
  issue: 'Issue',
  section: 'Section',
};

const DELETE_LABELS: Partial<Record<ReportEditTarget['kind'], string>> = {
  issue: 'Delete this issue',
  section: 'Delete this section',
};

export function ReportEditModal({
  target,
  report,
  onClose,
  onChange,
}: ReportEditModalProps) {
  // Freeze the active target so the modal can finish its close
  // animation against a stable target after the parent flips
  // `target` to `null`. We seed the draft from the current `report`
  // every time `target` changes, which is the only time we need a
  // fresh seed value.
  const initial = useMemo(
    () => (target ? seedDraft(report, target) : null),
    // We deliberately depend only on `target` — re-reading the report
    // mid-edit would clobber the user's draft.
    [target],
  );

  const visible = target !== null && initial !== null;
  // Render nothing when there is nothing to edit. The shell handles
  // its own close animation when `visible` flips to false on next
  // open, so an unmount on close is fine here.
  if (!target || initial === null) return null;

  const handleSave = (next: unknown) => {
    onChange(applyEdit(report, target, next as never));
    onClose();
  };

  const handleDelete = () => {
    onChange(applyDelete(report, target));
    onClose();
  };

  const isPerItem = target.kind === 'issue' || target.kind === 'section';
  const onDelete = isPerItem ? handleDelete : undefined;
  const deleteLabel = DELETE_LABELS[target.kind];

  // The body is selected by `target.kind`; each body declares its
  // own slice type so we cast `draft` once at the boundary.
  const renderBody = (
    draft: unknown,
    setDraft: (next: unknown) => void,
  ) => {
    switch (target.kind) {
      case 'meta':
        return (
          <EditMetaBody
            value={draft as GeneratedReportMeta}
            onChange={setDraft}
          />
        );
      case 'weather':
        return (
          <EditWeatherBody
            value={draft as GeneratedReportWeather}
            onChange={setDraft}
          />
        );
      case 'workers':
        return (
          <EditWorkersBody
            value={draft as GeneratedReportWorkers}
            onChange={setDraft}
          />
        );
      case 'materials':
        return (
          <EditMaterialsBody
            value={draft as GeneratedReportMaterial[]}
            onChange={setDraft}
          />
        );
      case 'nextSteps':
        return (
          <EditNextStepsBody value={draft as string[]} onChange={setDraft} />
        );
      case 'issue':
        return (
          <EditIssueBody
            value={draft as GeneratedReportIssue}
            onChange={setDraft}
          />
        );
      case 'section':
        return (
          <EditSectionBody
            value={draft as GeneratedReportSection}
            onChange={setDraft}
          />
        );
    }
  };

  return (
    <EditSectionSheet<unknown>
      visible={visible}
      title={TITLES[target.kind]}
      initialValue={initial}
      onCancel={onClose}
      onSave={handleSave}
      onDelete={onDelete}
      deleteLabel={deleteLabel}
      testID="report-edit-modal"
    >
      {renderBody}
    </EditSectionSheet>
  );
}
