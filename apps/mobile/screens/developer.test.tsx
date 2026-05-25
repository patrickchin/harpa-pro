/**
 * Developer screen body tests — covers the AI provider/model modal
 * flow that previously lived on the Profile screen.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { Developer, type AiProviderOption } from './developer';

function render(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(el);
  });
  return tree;
}

const PROVIDERS: ReadonlyArray<AiProviderOption> = [
  { key: 'kimi', label: 'Kimi', desc: 'Cheapest' },
  { key: 'openai', label: 'OpenAI', desc: 'Balanced' },
];

const MODELS = [
  { id: 'kimi-k2', label: 'Kimi K2' },
  { id: 'kimi-thinking', label: 'Kimi Thinking' },
];

const defaults = {
  onBack: vi.fn(),
  aiProviders: PROVIDERS,
  aiProvider: 'kimi',
  onSelectProvider: vi.fn(),
  aiModels: MODELS,
  aiModel: 'kimi-k2',
  onSelectModel: vi.fn(),
  availableProviderKeys: null,
};

describe('Developer', () => {
  it('opens the AI provider modal when the picker row is pressed', () => {
    const tree = render(<Developer {...defaults} />);
    act(() =>
      tree.root.findByProps({ testID: 'btn-open-ai-model' }).props.onPress(),
    );
    expect(() =>
      tree.root.findByProps({ testID: 'ai-provider-kimi' }),
    ).not.toThrow();
  });

  it('advances to the model step on provider select and fires callbacks on model tap', () => {
    const onSelectProvider = vi.fn();
    const onSelectModel = vi.fn();
    const tree = render(
      <Developer
        {...defaults}
        onSelectProvider={onSelectProvider}
        onSelectModel={onSelectModel}
      />,
    );
    act(() =>
      tree.root.findByProps({ testID: 'btn-open-ai-model' }).props.onPress(),
    );
    act(() =>
      tree.root.findByProps({ testID: 'ai-provider-openai' }).props.onPress(),
    );
    expect(onSelectProvider).toHaveBeenCalledWith('openai');
    act(() =>
      tree.root.findByProps({ testID: 'ai-model-kimi-thinking' }).props.onPress(),
    );
    expect(onSelectModel).toHaveBeenCalledWith('kimi-thinking');
  });

});
