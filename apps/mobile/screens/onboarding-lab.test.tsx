import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

import { OnboardingLab } from './onboarding-lab';

function render(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(el);
  });
  return tree;
}

function textOf(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (typeof node === 'object' && 'children' in node) {
    return textOf((node as { children?: unknown }).children);
  }
  return '';
}

const defaults = {
  selectedVariantId: 'report-first' as const,
  onSelectVariant: vi.fn(),
  onPrimaryAction: vi.fn(),
  onBack: vi.fn(),
};

describe('OnboardingLab', () => {
  it('renders all three onboarding optimization options', () => {
    const tree = render(<OnboardingLab {...defaults} />);
    const text = textOf(tree.toJSON());

    expect(text).toContain('Report first');
    expect(text).toContain('Sample report');
    expect(text).toContain('Workspace setup');
  });

  it('calls onSelectVariant when an option is pressed', () => {
    const onSelectVariant = vi.fn();
    const tree = render(
      <OnboardingLab {...defaults} onSelectVariant={onSelectVariant} />,
    );

    act(() => {
      tree.root
        .findByProps({ testID: 'onboarding-variant-sample-report' })
        .props.onPress();
    });

    expect(onSelectVariant).toHaveBeenCalledWith('sample-report');
  });

  it('renders the sample report preview for the sample-report variant', () => {
    const tree = render(
      <OnboardingLab {...defaults} selectedVariantId="sample-report" />,
    );
    const text = textOf(tree.toJSON());

    expect(text).toContain('Highland Tower');
    expect(text).toContain('Concrete delivery delay');
  });

  it('fires the primary action for the selected variant', () => {
    const onPrimaryAction = vi.fn();
    const tree = render(
      <OnboardingLab {...defaults} onPrimaryAction={onPrimaryAction} />,
    );

    act(() => {
      tree.root.findByProps({ testID: 'btn-onboarding-lab-primary' }).props.onPress();
    });

    expect(onPrimaryAction).toHaveBeenCalledWith('report-first');
  });
});
