/**
 * Tests for the `useAutoRegenerate` hook.
 *
 * 6 cases cover every gating condition that suppresses or enables the
 * auto-regeneration effect:
 *  1. fires when `needsRegeneration` flips true
 *  2. suppressed while `isGenerating`
 *  3. suppressed when `generationError` is set
 *  4. resumes after `generationError` clears
 *  5. suppressed for finalized reports
 *  6. queue-of-one: re-fires after in-flight resolves with flag still true
 */
import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { useAutoRegenerate } from './useAutoRegenerate';

function Harness(props: Parameters<typeof useAutoRegenerate>[0]) {
  useAutoRegenerate(props);
  return null;
}

const base = {
  needsRegeneration: false,
  status: 'draft' as const,
  isGenerating: false,
  generationError: null,
};

describe('useAutoRegenerate', () => {
  it('fires onRegenerate when needsRegeneration flips true', () => {
    const onRegenerate = vi.fn();
    const tree = TestRenderer.create(
      <Harness {...base} onRegenerate={onRegenerate} />,
    );
    expect(onRegenerate).not.toHaveBeenCalled();
    act(() => {
      tree.update(
        <Harness {...base} needsRegeneration onRegenerate={onRegenerate} />,
      );
    });
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('does not fire while isGenerating', () => {
    const onRegenerate = vi.fn();
    TestRenderer.create(
      <Harness
        {...base}
        needsRegeneration
        isGenerating
        onRegenerate={onRegenerate}
      />,
    );
    expect(onRegenerate).not.toHaveBeenCalled();
  });

  it('does not fire when generationError is set', () => {
    const onRegenerate = vi.fn();
    TestRenderer.create(
      <Harness
        {...base}
        needsRegeneration
        generationError="boom"
        onRegenerate={onRegenerate}
      />,
    );
    expect(onRegenerate).not.toHaveBeenCalled();
  });

  it('resumes after generationError clears', () => {
    const onRegenerate = vi.fn();
    const tree = TestRenderer.create(
      <Harness
        {...base}
        needsRegeneration
        generationError="boom"
        onRegenerate={onRegenerate}
      />,
    );
    expect(onRegenerate).not.toHaveBeenCalled();
    act(() => {
      tree.update(
        <Harness
          {...base}
          needsRegeneration
          generationError={null}
          onRegenerate={onRegenerate}
        />,
      );
    });
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('does not fire for finalized reports', () => {
    const onRegenerate = vi.fn();
    TestRenderer.create(
      <Harness
        {...base}
        needsRegeneration
        status="finalized"
        onRegenerate={onRegenerate}
      />,
    );
    expect(onRegenerate).not.toHaveBeenCalled();
  });

  it('queue-of-one: re-fires when flag stays true after an in-flight resolves', () => {
    const onRegenerate = vi.fn();
    const tree = TestRenderer.create(
      <Harness
        {...base}
        needsRegeneration
        isGenerating
        onRegenerate={onRegenerate}
      />,
    );
    expect(onRegenerate).not.toHaveBeenCalled();
    act(() => {
      tree.update(
        <Harness
          {...base}
          needsRegeneration
          isGenerating={false}
          onRegenerate={onRegenerate}
        />,
      );
    });
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });
});
