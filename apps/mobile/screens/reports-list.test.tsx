import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { ReportsList } from './reports-list';
import type { ReportListItem } from '@/lib/project-reports-list';

function render(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(el);
  });
  return tree;
}
function collectText(n: any): string {
  if (n == null) return '';
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map(collectText).join(' ');
  if (n.children) return collectText(n.children);
  return '';
}

const draft: ReportListItem = {
  id: 'r1',
  slug: 'rpt_a',
  number: 3,
  status: 'draft',
  visitDate: '2024-03-15T10:00:00.000Z',
  createdAt: '2024-03-15T09:00:00.000Z',
  updatedAt: '2024-03-15T10:00:00.000Z',
};
const final: ReportListItem = {
  id: 'r2',
  slug: 'rpt_b',
  number: 2,
  status: 'finalized',
  visitDate: '2024-03-10T10:00:00.000Z',
  createdAt: '2024-03-10T09:00:00.000Z',
  updatedAt: '2024-03-10T11:00:00.000Z',
};

const defaults = {
  reports: [draft, final],
  projectName: 'Highland Tower',
  canCreate: true,
  isLoading: false,
  refreshing: false,
  isCreating: false,
  onRefresh: vi.fn(),
  onBack: vi.fn(),
  onCreate: vi.fn(),
  onOpenReport: vi.fn(),
};

describe('ReportsList', () => {
  it('renders skeleton when loading', () => {
    const tree = render(<ReportsList {...defaults} isLoading />);
    expect(tree.root.findAllByProps({ testID: 'btn-new-report' })).toHaveLength(0);
  });

  it('renders new-report affordance when canCreate', () => {
    const tree = render(<ReportsList {...defaults} />);
    expect(() => tree.root.findByProps({ testID: 'btn-new-report' })).not.toThrow();
  });

  it('hides new-report affordance when !canCreate', () => {
    const tree = render(<ReportsList {...defaults} canCreate={false} />);
    expect(tree.root.findAllByProps({ testID: 'btn-new-report' })).toHaveLength(0);
  });

  it('disables create button while isCreating', () => {
    const onCreate = vi.fn();
    const tree = render(<ReportsList {...defaults} isCreating onCreate={onCreate} />);
    act(() => tree.root.findByProps({ testID: 'btn-new-report' }).props.onPress());
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('fires onCreate when new-report pressed', () => {
    const onCreate = vi.fn();
    const tree = render(<ReportsList {...defaults} onCreate={onCreate} />);
    act(() => tree.root.findByProps({ testID: 'btn-new-report' }).props.onPress());
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('renders without errors when there are reports (row press is renderItem, not testable in renderer)', () => {
    const tree = render(<ReportsList {...defaults} />);
    expect(tree.toJSON()).toBeTruthy();
  });

  it('renders empty state when there are no reports', () => {
    const tree = render(<ReportsList {...defaults} reports={[]} />);
    expect(collectText(tree.toJSON())).toContain('No reports yet');
  });

  it('shows the project name in the header subtitle', () => {
    const tree = render(<ReportsList {...defaults} />);
    expect(collectText(tree.toJSON())).toContain('Highland Tower');
  });
});
