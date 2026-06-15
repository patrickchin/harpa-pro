import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type {
  GeneratedReportIssue,
  GeneratedReportSection,
} from '@harpa/report-core';

import { IssuesCard } from './IssuesCard';
import { SummarySectionCard } from './SummarySectionCard';

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

function expectHeaderActionButton(
  tree: ReactTestRenderer,
  testID: string,
): void {
  const button = tree.root
    .findAll((node) => node.props.testID === testID)
    .find((node) => node.props.accessibilityRole === 'button');
  expect(button).toBeTruthy();
  if (!button) return;
  expect(button.props.accessibilityRole).toBe('button');
  expect(String(button.props.className)).toContain('h-9 w-9');
  expect(String(button.props.className)).toContain('border border-border bg-card');
}

const SECTION: GeneratedReportSection = {
  title: 'Roof',
  content: 'Roof anchors need confirmation.',
};

const ISSUE: GeneratedReportIssue = {
  title: 'Loose edge protection',
  category: 'safety',
  severity: 'high',
  status: 'open',
  details: 'Temporary guardrails need another pass.',
  actionRequired: null,
};

describe('report card header actions', () => {
  it('renders section edit and add-attachments controls together as uniform header buttons', () => {
    const tree = render(
      <SummarySectionCard
        section={SECTION}
        sectionIndex={2}
        onEdit={vi.fn()}
        onAddAttachments={vi.fn()}
      />,
    );

    const actionRow = tree.root.findByProps({
      testID: 'report-section-actions-2',
    });

    expect(String(actionRow.props.className)).toContain('flex-row');
    expectHeaderActionButton(tree, 'btn-add-attachments-section-2');
    expectHeaderActionButton(tree, 'btn-edit-section-2');
  });

  it('renders issue edit and add-attachments controls together as uniform header buttons', () => {
    const tree = render(
      <IssuesCard
        issues={[ISSUE]}
        onEditIssue={vi.fn()}
        onAddAttachmentsToIssue={vi.fn()}
      />,
    );

    const actionRow = tree.root.findByProps({
      testID: 'report-issue-actions-0',
    });

    expect(String(actionRow.props.className)).toContain('flex-row');
    expectHeaderActionButton(tree, 'btn-add-attachments-issue-0');
    expectHeaderActionButton(tree, 'btn-edit-issue-0');
  });
});
