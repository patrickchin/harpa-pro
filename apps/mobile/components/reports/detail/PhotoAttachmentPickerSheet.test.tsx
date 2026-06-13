import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PhotoAttachmentPickerSheet } from './PhotoAttachmentPickerSheet';
import type { PhotoGroup } from '@/lib/reports/photo-placements';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) =>
    React.createElement('rn-expo-image', props, null),
}));

vi.mock('@/lib/uploads/useFileSignedUrl', () => ({
  useFileSignedUrl: (fileId: string | null | undefined) => ({
    data: fileId
      ? {
          url: `https://r2.example.com/${fileId}.jpg`,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }
      : undefined,
  }),
}));

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

function group(index: number): PhotoGroup {
  return {
    noteId: `n_${index}`,
    title: `Photo group ${index + 1}`,
    photos: [
      {
        id: `p_${index}_0`,
        fileId: `fil_${index}_0`,
        thumbnailFileId: `thm_${index}_0`,
      },
      {
        id: `p_${index}_1`,
        fileId: `fil_${index}_1`,
        thumbnailFileId: null,
      },
    ],
  };
}

describe('PhotoAttachmentPickerSheet', () => {
  it('renders its helper copy as informational, not destructive', () => {
    const tree = render(
      <PhotoAttachmentPickerSheet
        visible
        onClose={vi.fn()}
        targetLabel="Roof"
        groups={[group(0)]}
        onSelect={vi.fn()}
      />,
    );

    expect(
      tree.root.findAll(
        (node) =>
          typeof node.props.className === 'string' &&
          node.props.className.includes('border-info-border bg-info-soft'),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAll(
        (node) =>
          typeof node.props.className === 'string' &&
          node.props.className.includes('border-danger-border bg-danger-soft'),
      ),
    ).toHaveLength(0);
  });

  it('renders a first-photo thumbnail for every selectable group', () => {
    const tree = render(
      <PhotoAttachmentPickerSheet
        visible
        onClose={vi.fn()}
        targetLabel="Roof"
        groups={[group(0)]}
        onSelect={vi.fn()}
      />,
    );

    const image = tree.root
      .findAll((node) => node.props.testID === 'attachment-picker-thumbnail-0-image')
      .find((node) => node.type === ('rn-expo-image' as unknown));
    expect(image).toBeTruthy();
    if (!image) return;

    expect(image.props.source).toEqual({
      uri: 'https://r2.example.com/thm_0_0.jpg',
      cacheKey: 'thm_0_0',
    });
  });

  it('marks each row by index so the scroll-heavy picker path can target later groups', () => {
    const groups = Array.from({ length: 10 }, (_, index) => group(index));
    const tree = render(
      <PhotoAttachmentPickerSheet
        visible
        onClose={vi.fn()}
        targetLabel="Roof"
        groups={groups}
        onSelect={vi.fn()}
      />,
    );

    expect(
      tree.root.findByProps({ testID: 'attachment-picker-group-index-9' }),
    ).toBeTruthy();
    expect(
      tree.root.findByProps({ testID: 'attachment-picker-thumbnail-9-image' }),
    ).toBeTruthy();
  });
});
