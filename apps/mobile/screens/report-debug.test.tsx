/**
 * ReportDebug screen body tests.
 *
 * Covers:
 *  - loading state
 *  - error state
 *  - empty-state (no last generation yet) renders the placeholder
 *  - populated state renders prompt + notes + LLM response
 *  - back button invokes onBack
 *
 * Mirrors `account.test.tsx` rendering pattern (react-test-renderer +
 * act). The screen body is props-only so no API mocks are needed.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { ReportDebug, type ReportDebugProps } from './report-debug';

function render(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(el);
  });
  return tree;
}

function findByTestID(
  node: TestRenderer.ReactTestInstance,
  testID: string,
): TestRenderer.ReactTestInstance | null {
  try {
    return node.findByProps({ testID });
  } catch {
    return null;
  }
}

const baseProps: ReportDebugProps = {
  reportNumber: 7,
  isLoading: false,
  loadError: null,
  prompt: { system: '', user: '' },
  notes: [],
  lastGeneration: null,
  onBack: () => {},
};

describe('ReportDebug', () => {
  it('renders loading state', () => {
    const tree = render(<ReportDebug {...baseProps} isLoading />);
    expect(findByTestID(tree.root, 'report-debug-loading')).not.toBeNull();
  });

  it('renders error state with message', () => {
    const tree = render(
      <ReportDebug
        {...baseProps}
        loadError={new Error('boom')}
      />,
    );
    expect(findByTestID(tree.root, 'report-debug-error')).not.toBeNull();
  });

  it('renders empty-state when no last generation', () => {
    const tree = render(<ReportDebug {...baseProps} />);
    expect(findByTestID(tree.root, 'debug-empty-state')).not.toBeNull();
    expect(findByTestID(tree.root, 'debug-llm-response')).toBeNull();
  });

  it('renders prompt, notes, and LLM response when populated', () => {
    const tree = render(
      <ReportDebug
        {...baseProps}
        prompt={{ system: 'SYS-A', user: 'USR-B' }}
        notes={[
          {
            id: 'n1',
            kind: 'text',
            body: 'a text note',
            transcript: null,
            createdAt: new Date(0).toISOString(),
          },
        ]}
        lastGeneration={{
          requestedAt: new Date(0).toISOString(),
          finishedAt: new Date(0).toISOString(),
          vendor: 'fixture',
          model: 'mock-1',
          fixtureMode: 'replay',
          systemPrompt: 'SYS-PRIOR',
          userPrompt: 'USR-PRIOR',
          response: 'RESP-XYZ',
          usage: null,
        }}
      />,
    );
    expect(findByTestID(tree.root, 'debug-prompt')).not.toBeNull();
    expect(findByTestID(tree.root, 'debug-report-notes')).not.toBeNull();
    expect(findByTestID(tree.root, 'debug-llm-response')).not.toBeNull();
    expect(findByTestID(tree.root, 'debug-note-n1')).not.toBeNull();
    expect(findByTestID(tree.root, 'debug-empty-state')).toBeNull();
  });

  it('invokes onBack when header back is pressed', () => {
    const onBack = vi.fn();
    const tree = render(<ReportDebug {...baseProps} onBack={onBack} />);
    const backBtn = findByTestID(tree.root, 'btn-back');
    expect(backBtn).not.toBeNull();
    act(() => {
      backBtn!.props.onPress();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
