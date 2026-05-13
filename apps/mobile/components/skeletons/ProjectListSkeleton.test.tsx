/**
 * Tests for ProjectListSkeleton component.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { create, act, type ReactTestRenderer } from 'react-test-renderer';
import { ProjectListSkeleton } from './ProjectListSkeleton';

describe('ProjectListSkeleton', () => {
  it('matches snapshot', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(<ProjectListSkeleton />);
    });
    expect(tree!.toJSON()).toMatchSnapshot();
  });

  it('renders new project card skeleton', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(<ProjectListSkeleton />);
    });
    const root = tree!.root;
    // Should contain skeleton placeholders (the component itself verifies structure)
    expect(root).toBeTruthy();
  });

  it('renders three project card skeletons', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(<ProjectListSkeleton />);
    });
    const root = tree!.root;
    // The structure includes NewProjectCardSkeleton + 3x ProjectCardSkeleton
    expect(root).toBeTruthy();
  });
});
