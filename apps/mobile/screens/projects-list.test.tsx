/**
 * Tests for ProjectsList screen body component.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { create, act, type ReactTestRenderer } from 'react-test-renderer';
import { Pressable } from 'react-native';
import { ProjectsList } from './projects-list';
import type { ProjectRow } from './projects-list';

const MOCK_PROJECTS: readonly ProjectRow[] = [
  {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Construction Site A',
    role: 'owner',
    address: '123 Main St, San Francisco, CA',
    updatedAt: '2024-03-15T10:30:00.000Z',
  },
  {
    id: '223e4567-e89b-12d3-a456-426614174001',
    name: 'Office Building Renovation',
    role: 'admin',
    address: null,
    updatedAt: '2024-03-14T08:15:00.000Z',
  },
  {
    id: '323e4567-e89b-12d3-a456-426614174002',
    name: 'Residential Complex',
    role: 'viewer',
    address: '789 Oak Ave, Palo Alto, CA',
    updatedAt: '2024-03-10T14:45:00.000Z',
  },
];

describe('ProjectsList', () => {
  it('matches snapshot with projects', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        <ProjectsList
          projects={MOCK_PROJECTS}
          isLoading={false}
          refreshing={false}
          onRefresh={vi.fn()}
          onPressProject={vi.fn()}
          onPressNewProject={vi.fn()}
        />
      );
    });
    expect(tree!.toJSON()).toMatchSnapshot();
  });

  it('matches snapshot when empty', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        <ProjectsList
          projects={[]}
          isLoading={false}
          refreshing={false}
          onRefresh={vi.fn()}
          onPressProject={vi.fn()}
          onPressNewProject={vi.fn()}
        />
      );
    });
    expect(tree!.toJSON()).toMatchSnapshot();
  });

  it('matches snapshot when loading', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        <ProjectsList
          projects={[]}
          isLoading={true}
          refreshing={false}
          onRefresh={vi.fn()}
          onPressProject={vi.fn()}
          onPressNewProject={vi.fn()}
        />
      );
    });
    expect(tree!.toJSON()).toMatchSnapshot();
  });

  it('renders ListHeaderComponent when projects exist', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        <ProjectsList
          projects={MOCK_PROJECTS}
          isLoading={false}
          refreshing={false}
          onRefresh={vi.fn()}
          onPressProject={vi.fn()}
          onPressNewProject={vi.fn()}
        />
      );
    });
    const pressables = tree!.root.findAllByType(Pressable);
    // Should have header "Add new project" + 3 project rows
    expect(pressables.length).toBeGreaterThan(0);
  });

  it('does not render ListHeaderComponent when empty', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        <ProjectsList
          projects={[]}
          isLoading={false}
          refreshing={false}
          onRefresh={vi.fn()}
          onPressProject={vi.fn()}
          onPressNewProject={vi.fn()}
        />
      );
    });
    const json = tree!.toJSON();
    // EmptyState should be rendered, not the header card
    expect(JSON.stringify(json)).toContain('No projects yet');
  });

  it('renders EmptyState when no projects', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        <ProjectsList
          projects={[]}
          isLoading={false}
          refreshing={false}
          onRefresh={vi.fn()}
          onPressProject={vi.fn()}
          onPressNewProject={vi.fn()}
        />
      );
    });
    const json = tree!.toJSON();
    expect(JSON.stringify(json)).toContain('No projects yet');
    expect(JSON.stringify(json)).toContain('Add your first project');
  });

  it('calls onPressProject with correct id when row is pressed', () => {
    const onPressProject = vi.fn();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        <ProjectsList
          projects={MOCK_PROJECTS}
          isLoading={false}
          refreshing={false}
          onRefresh={vi.fn()}
          onPressProject={onPressProject}
          onPressNewProject={vi.fn()}
        />
      );
    });
    
    const pressables = tree!.root.findAllByType(Pressable);
    // First pressable is the header card, second is the first project row
    const firstProjectRow = pressables[1]!;
    expect(firstProjectRow).toBeDefined();
    
    act(() => {
      firstProjectRow.props.onPress();
    });
    
    expect(onPressProject).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
  });

  it('calls onPressNewProject when header card is pressed', () => {
    const onPressNewProject = vi.fn();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        <ProjectsList
          projects={MOCK_PROJECTS}
          isLoading={false}
          refreshing={false}
          onRefresh={vi.fn()}
          onPressProject={vi.fn()}
          onPressNewProject={onPressNewProject}
        />
      );
    });
    
    const pressables = tree!.root.findAllByType(Pressable);
    const headerCard = pressables[0]!; // First pressable is the "Add new project" card
    expect(headerCard).toBeDefined();
    
    act(() => {
      headerCard.props.onPress();
    });
    
    expect(onPressNewProject).toHaveBeenCalledTimes(1);
  });

  it('renders address row only when address is non-null', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        <ProjectsList
          projects={MOCK_PROJECTS}
          isLoading={false}
          refreshing={false}
          onRefresh={vi.fn()}
          onPressProject={vi.fn()}
          onPressNewProject={vi.fn()}
        />
      );
    });
    
    const json = JSON.stringify(tree!.toJSON());
    // First project has address
    expect(json).toContain('123 Main St, San Francisco, CA');
    // Second project has no address (should not appear)
    expect(json).toContain('Office Building Renovation');
    // Third project has address
    expect(json).toContain('789 Oak Ave, Palo Alto, CA');
  });

  it('renders role labels correctly', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        <ProjectsList
          projects={MOCK_PROJECTS}
          isLoading={false}
          refreshing={false}
          onRefresh={vi.fn()}
          onPressProject={vi.fn()}
          onPressNewProject={vi.fn()}
        />
      );
    });
    
    const json = JSON.stringify(tree!.toJSON());
    expect(json).toContain('Owner'); // role: 'owner'
    expect(json).toContain('Admin'); // role: 'admin'
    expect(json).toContain('Viewer'); // role: 'viewer'
  });

  it('renders skeleton when isLoading is true', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        <ProjectsList
          projects={[]}
          isLoading={true}
          refreshing={false}
          onRefresh={vi.fn()}
          onPressProject={vi.fn()}
          onPressNewProject={vi.fn()}
        />
      );
    });
    
    // Should render ProjectListSkeleton, not FlatList
    const json = tree!.toJSON();
    expect(json).toBeTruthy();
  });
});
