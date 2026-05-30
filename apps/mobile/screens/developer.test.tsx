/**
 * Developer screen body tests — single-step model picker. Default row
 * clears server overrides; model rows pin a {vendor, model} pair.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { Developer, type AiModelOption } from './developer';

function render(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(el);
  });
  return tree;
}

const MODELS: ReadonlyArray<AiModelOption> = [
  {
    id: 'gpt-4.1-nano',
    label: 'GPT-4.1 nano',
    tagline: 'Fastest',
    latencyMs: 2100,
    costPerReport: 0.0003,
  },
  {
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 mini',
    tagline: 'Default',
    latencyMs: 4700,
    costPerReport: 0.001,
    isDefault: true,
  },
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    tagline: 'Highest quality',
    latencyMs: 2600,
    costPerReport: 0.006,
  },
];

const defaults = {
  onBack: vi.fn(),
  aiModels: MODELS,
  aiSelection: null,
  onSelectModel: vi.fn(),
  isLoadingSelection: false,
  showGenerateDebugTab: true,
  onToggleGenerateDebugTab: vi.fn(),
  showGenerateEditTab: true,
  onToggleGenerateEditTab: vi.fn(),
};

describe('Developer', () => {
  it('opens the AI model modal when the picker row is pressed', () => {
    const tree = render(<Developer {...defaults} />);
    act(() =>
      tree.root.findByProps({ testID: 'btn-open-ai-model' }).props.onPress(),
    );
    expect(() =>
      tree.root.findByProps({ testID: 'ai-model-default' }),
    ).not.toThrow();
    expect(() =>
      tree.root.findByProps({ testID: 'ai-model-gpt-4.1-mini' }),
    ).not.toThrow();
  });

  it('selecting the Default row clears the server override (passes null)', () => {
    const onSelectModel = vi.fn();
    const tree = render(
      <Developer
        {...defaults}
        aiSelection={{ vendor: 'openai', model: 'gpt-4.1' }}
        onSelectModel={onSelectModel}
      />,
    );
    act(() =>
      tree.root.findByProps({ testID: 'btn-open-ai-model' }).props.onPress(),
    );
    act(() =>
      tree.root.findByProps({ testID: 'ai-model-default' }).props.onPress(),
    );
    expect(onSelectModel).toHaveBeenCalledWith(null);
  });

  it('selecting a model fires onSelectModel with the {vendor, model} pair', () => {
    const onSelectModel = vi.fn();
    const tree = render(
      <Developer {...defaults} onSelectModel={onSelectModel} />,
    );
    act(() =>
      tree.root.findByProps({ testID: 'btn-open-ai-model' }).props.onPress(),
    );
    act(() =>
      tree.root.findByProps({ testID: 'ai-model-gpt-4.1' }).props.onPress(),
    );
    expect(onSelectModel).toHaveBeenCalledWith({
      vendor: 'openai',
      model: 'gpt-4.1',
    });
  });

  it('renders the loading state when isLoadingSelection is true', () => {
    const tree = render(<Developer {...defaults} isLoadingSelection />);
    const summary = tree.root.findByProps({ testID: 'btn-open-ai-model' });
    expect(summary.props.disabled).toBe(true);
  });

  it('fires the toggle callbacks when the developer flags switches are flipped', () => {
    const onToggleGenerateDebugTab = vi.fn();
    const onToggleGenerateEditTab = vi.fn();
    const tree = render(
      <Developer
        {...defaults}
        onToggleGenerateDebugTab={onToggleGenerateDebugTab}
        onToggleGenerateEditTab={onToggleGenerateEditTab}
      />,
    );
    act(() =>
      tree.root
        .findByProps({ testID: 'switch-generate-debug-tab' })
        .props.onValueChange(false),
    );
    expect(onToggleGenerateDebugTab).toHaveBeenCalledWith(false);
    act(() =>
      tree.root
        .findByProps({ testID: 'switch-generate-edit-tab' })
        .props.onValueChange(false),
    );
    expect(onToggleGenerateEditTab).toHaveBeenCalledWith(false);
  });
});
