import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { CachedImage } from './CachedImage';

vi.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) =>
    React.createElement('rn-expo-image', props, null),
}));

describe('CachedImage', () => {
  it('merges cacheKey into URI-shaped source objects', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <CachedImage
          source={{ uri: 'https://r2.example.com/full.jpg?sig=abc' }}
          cacheKey="fil_full"
        />,
      );
    });

    const img = tree.root.findByType('rn-expo-image' as any);
    expect(img.props.source).toEqual({
      uri: 'https://r2.example.com/full.jpg?sig=abc',
      cacheKey: 'fil_full',
    });
  });

  it('merges placeholderCacheKey into URI-shaped placeholders', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <CachedImage
          source={{ uri: 'https://r2.example.com/full.jpg?sig=abc' }}
          placeholder={{ uri: 'https://r2.example.com/thumb.jpg?sig=def' }}
          placeholderCacheKey="fil_thumb"
        />,
      );
    });

    const img = tree.root.findByType('rn-expo-image' as any);
    expect(img.props.placeholder).toEqual({
      uri: 'https://r2.example.com/thumb.jpg?sig=def',
      cacheKey: 'fil_thumb',
    });
  });

  it('leaves blurhash placeholders untouched', () => {
    const blurhash = 'LEHV6nWB2yk8pyo0adR*.7kCMdnj';
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <CachedImage
          source={{ uri: 'https://r2.example.com/full.jpg?sig=abc' }}
          blurhash={blurhash}
          placeholderCacheKey="fil_thumb"
        />,
      );
    });

    const img = tree.root.findByType('rn-expo-image' as any);
    expect(img.props.placeholder).toEqual({ blurhash });
  });

  it('leaves array placeholders untouched', () => {
    const placeholder = [
      { uri: 'https://r2.example.com/a.jpg' },
      { uri: 'https://r2.example.com/b.jpg' },
    ];
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <CachedImage
          source={{ uri: 'https://r2.example.com/full.jpg?sig=abc' }}
          placeholder={placeholder}
          placeholderCacheKey="fil_thumb"
        />,
      );
    });

    const img = tree.root.findByType('rn-expo-image' as any);
    expect(img.props.placeholder).toBe(placeholder);
  });
});
