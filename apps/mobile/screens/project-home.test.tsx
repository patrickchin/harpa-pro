import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { ProjectHome, type ProjectHomeProjectInfo } from './project-home';

function render(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(el);
  });
  return tree;
}

function collectText(node: any): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  if (node.children) return collectText(node.children);
  return '';
}

const baseProject: ProjectHomeProjectInfo = {
  name: 'Highland Tower',
  clientName: 'Acme Co.',
  address: '2400 Highland Ave',
  myRole: 'owner',
  stats: { totalReports: 5, drafts: 1, lastReportAt: null },
};

const defaults = {
  project: baseProject,
  isLoading: false,
  refreshing: false,
  onRefresh: vi.fn(),
  onBack: vi.fn(),
  onPressEdit: vi.fn(),
  onPressReports: vi.fn(),
  onPressMembers: vi.fn(),
  copiedKey: null,
  onCopy: vi.fn(),
};

describe('ProjectHome', () => {
  it('renders skeleton when isLoading (no project copy visible)', () => {
    const tree = render(<ProjectHome {...defaults} isLoading />);
    const text = collectText(tree.toJSON());
    expect(text).not.toContain('Acme Co.');
  });

  it('renders client + address + stats when loaded', () => {
    const tree = render(<ProjectHome {...defaults} />);
    const text = collectText(tree.toJSON());
    expect(text).toContain('Acme Co.');
    expect(text).toContain('2400 Highland Ave');
    expect(text).toContain('Highland Tower');
    expect(text).toContain('5 reports');
  });

  it('shows edit button when myRole is owner', () => {
    const tree = render(<ProjectHome {...defaults} />);
    expect(() =>
      tree.root.findByProps({ testID: 'btn-edit-project' }),
    ).not.toThrow();
  });

  it('hides edit button when myRole is viewer', () => {
    const tree = render(
      <ProjectHome {...defaults} project={{ ...baseProject, myRole: 'viewer' }} />,
    );
    expect(tree.root.findAllByProps({ testID: 'btn-edit-project' })).toHaveLength(0);
  });

  it('fires onPressReports when reports row is pressed', () => {
    const onPressReports = vi.fn();
    const tree = render(
      <ProjectHome {...defaults} onPressReports={onPressReports} />,
    );
    act(() =>
      tree.root.findByProps({ testID: 'btn-open-reports' }).props.onPress(),
    );
    expect(onPressReports).toHaveBeenCalledTimes(1);
  });

  it('fires onCopy with "client" key when client row is pressed', () => {
    const onCopy = vi.fn();
    const tree = render(<ProjectHome {...defaults} onCopy={onCopy} />);
    act(() =>
      tree.root.findByProps({ testID: 'btn-copy-client' }).props.onPress(),
    );
    expect(onCopy).toHaveBeenCalledWith('Acme Co.', 'client');
  });

  it('renders "No reports yet" when stats are empty', () => {
    const tree = render(
      <ProjectHome
        {...defaults}
        project={{
          ...baseProject,
          stats: { totalReports: 0, drafts: 0, lastReportAt: null },
        }}
      />,
    );
    expect(collectText(tree.toJSON())).toContain('No reports yet');
  });

  it('matches snapshot at default props', () => {
    const tree = render(<ProjectHome {...defaults} />);
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
