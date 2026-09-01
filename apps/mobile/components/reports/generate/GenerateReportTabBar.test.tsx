import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

const tabState = vi.hoisted(() => ({ set: vi.fn() }));

vi.mock('@/features/generate/GenerateReportProvider', () => ({
  useGenerateReport: () => ({
    tabs: { active: 'notes', set: tabState.set },
    notes: { totalCount: 2 },
    generation: { isUpdating: false },
  }),
}));

import { GenerateReportTabBar } from './GenerateReportTabBar';

function render(showDebugTab = false): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<GenerateReportTabBar showDebugTab={showDebugTab} />);
  });
  return tree;
}

describe('GenerateReportTabBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only exposes Debug when the route enables it', () => {
    const tree = render();
    expect(tree.root.findAllByProps({ testID: 'btn-tab-debug' })).toHaveLength(0);

    act(() => tree.update(<GenerateReportTabBar showDebugTab />));
    const debug = tree.root.findByProps({ testID: 'btn-tab-debug' });
    act(() => debug.props.onPress());
    expect(tabState.set).toHaveBeenCalledWith('debug');

    act(() => tree.update(<GenerateReportTabBar />));
    expect(tree.root.findAllByProps({ testID: 'btn-tab-debug' })).toHaveLength(0);
  });
});
