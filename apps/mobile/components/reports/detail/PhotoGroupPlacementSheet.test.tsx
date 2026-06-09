/**
 * Snapshot + behaviour tests for `PhotoGroupPlacementSheet` and
 * `PhotoPlacementChip`. Mirrors the testing pattern used by
 * `AppDialogSheet.test.tsx`.
 */
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import type { GeneratedReportIssue, GeneratedReportSection } from '@harpa/report-core';

import { PhotoGroupPlacementSheet } from './PhotoGroupPlacementSheet';
import { PhotoPlacementChip } from './PhotoPlacementChip';

function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

const ISSUES: GeneratedReportIssue[] = [
  {
    title: 'Cracked beam',
    category: 'structural',
    severity: 'high',
    status: 'open',
    details: 'Visible crack on left side',
    actionRequired: 'Engineer review',
  },
  {
    title: 'Loose railing',
    category: 'safety',
    severity: 'medium',
    status: 'open',
    details: 'Second floor balcony',
    actionRequired: null,
  },
];

const SECTIONS: GeneratedReportSection[] = [
  { title: 'Site Conditions', content: 'Sunny, dry.' },
  { title: 'Quality Control', content: 'All good.' },
];

describe('PhotoGroupPlacementSheet', () => {
  it('renders issues and sections when there are targets', () => {
    const tree = render(
      <PhotoGroupPlacementSheet
        visible
        onClose={() => {}}
        photoCount={3}
        issues={ISSUES}
        sections={SECTIONS}
        current={null}
        onSelect={() => {}}
      />,
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });

  it('shows the empty-state copy when no issues or sections exist', () => {
    const tree = render(
      <PhotoGroupPlacementSheet
        visible
        onClose={() => {}}
        photoCount={1}
        issues={[]}
        sections={[]}
        current={null}
        onSelect={() => {}}
      />,
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('no issues or sections yet');
  });

  it('renders a Remove placement row only when a current placement exists', () => {
    const placedTree = render(
      <PhotoGroupPlacementSheet
        visible
        onClose={() => {}}
        photoCount={1}
        issues={ISSUES}
        sections={SECTIONS}
        current={{ kind: 'issue', index: 0 }}
        onSelect={() => {}}
      />,
    );
    expect(JSON.stringify(placedTree.toJSON())).toContain('placement-sheet-remove');

    const unplacedTree = render(
      <PhotoGroupPlacementSheet
        visible
        onClose={() => {}}
        photoCount={1}
        issues={ISSUES}
        sections={SECTIONS}
        current={null}
        onSelect={() => {}}
      />,
    );
    expect(JSON.stringify(unplacedTree.toJSON())).not.toContain('placement-sheet-remove');
  });

  it('passes the chosen placement to onSelect', () => {
    const onSelect = vi.fn();
    const tree = render(
      <PhotoGroupPlacementSheet
        visible
        onClose={() => {}}
        photoCount={1}
        issues={ISSUES}
        sections={SECTIONS}
        current={null}
        onSelect={onSelect}
      />,
    );
    const node = tree.root.findByProps({ testID: 'placement-sheet-section-1' });
    act(() => {
      (node.props.onPress as () => void)();
    });
    expect(onSelect).toHaveBeenCalledWith({ kind: 'section', index: 1 });
  });

  it('passes null to onSelect when Remove placement is tapped', () => {
    const onSelect = vi.fn();
    const tree = render(
      <PhotoGroupPlacementSheet
        visible
        onClose={() => {}}
        photoCount={1}
        issues={ISSUES}
        sections={SECTIONS}
        current={{ kind: 'section', index: 0 }}
        onSelect={onSelect}
      />,
    );
    const node = tree.root.findByProps({ testID: 'placement-sheet-remove' });
    act(() => {
      (node.props.onPress as () => void)();
    });
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe('PhotoPlacementChip', () => {
  it('renders the unplaced state when placedLabel is null', () => {
    const tree = render(
      <PhotoPlacementChip
        placedLabel={null}
        onPress={() => {}}
        testID="chip"
      />,
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Place into');
  });

  it('renders the placed state with the target label', () => {
    const tree = render(
      <PhotoPlacementChip
        placedLabel="Cracked beam"
        onPress={() => {}}
        testID="chip"
      />,
    );
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Cracked beam');
  });

  it('invokes onPress when tapped', () => {
    const onPress = vi.fn();
    const tree = render(
      <PhotoPlacementChip
        placedLabel={null}
        onPress={onPress}
        testID="chip"
      />,
    );
    const node = tree.root.findByProps({ testID: 'chip' });
    act(() => {
      (node.props.onPress as () => void)();
    });
    expect(onPress).toHaveBeenCalledOnce();
  });
});
