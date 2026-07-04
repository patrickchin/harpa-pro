import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { UploadFileSizeLimitError } from '@/lib/uploads/file-size-limit-error';
import { FileSizeLimitDialog } from './FileSizeLimitDialog';

function text(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(text).join(' ');
  return text((node as { children?: unknown }).children);
}

describe('FileSizeLimitDialog', () => {
  it('shows the actual Free ceiling and an Upgrade action', () => {
    const onUpgrade = vi.fn();
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <FileSizeLimitDialog
          error={new UploadFileSizeLimitError({
            sizeBytes: 6 * 1024 * 1024,
            limitBytes: 5 * 1024 * 1024,
            plan: 'free',
          })}
          onClose={vi.fn()}
          onUpgrade={onUpgrade}
        />,
      );
    });
    expect(text(tree.toJSON())).toContain('5 MB');
    act(() => tree.root.findByProps({ testID: 'file-size-limit-upgrade' }).props.onPress());
    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it('keeps paid plans on close/retry guidance', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <FileSizeLimitDialog
          error={new UploadFileSizeLimitError({
            sizeBytes: 51 * 1024 * 1024,
            limitBytes: 50 * 1024 * 1024,
            plan: 'pro',
          })}
          onClose={vi.fn()}
          onUpgrade={vi.fn()}
        />,
      );
    });
    expect(text(tree.toJSON())).toContain('50 MB');
    expect(tree.root.findAllByProps({ testID: 'file-size-limit-upgrade' })).toHaveLength(0);
  });
});
