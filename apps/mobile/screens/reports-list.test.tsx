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
  number: 3,
  status: 'draft',
  visitDate: '2024-03-15T10:00:00.000Z',
  createdAt: '2024-03-15T09:00:00.000Z',
  updatedAt: '2024-03-15T10:00:00.000Z',
};
const final: ReportListItem = {
  id: 'r2',
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
  it('renders skeleton when loading but keeps new-report affordance visible (disabled)', () => {
    const tree = render(<ReportsList {...defaults} isLoading />);
    // The "New report" Pressable must stay mounted across the loading
    // → loaded transition so the list doesn't shift down on hydrate.
    const btn = tree.root.findByProps({ testID: 'btn-new-report' });
    expect(btn.props.disabled).toBe(true);
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

  it('accepts an optimistic row in the reports list without throwing', () => {
    // SectionList renderItem isn't exercised by react-test-renderer
    // (see the "renders without errors" test above), so we can't
    // assert on the optimistic row's "Creating…" copy here. The
    // cache-level optimistic insert is covered in
    // `lib/api/optimistic.test.tsx`; this test just guards that the
    // screen tolerates the temp row shape we synthesise.
    const optimistic: ReportListItem = {
      id: 'rep_opt0123456789',
      number: 0,
      status: 'draft',
      visitDate: null,
      createdAt: '2024-03-20T09:00:00.000Z',
      updatedAt: '2024-03-20T09:00:00.000Z',
    };
    const tree = render(
      <ReportsList {...defaults} reports={[optimistic, final]} />,
    );
    expect(tree.toJSON()).toBeTruthy();
  });
});
