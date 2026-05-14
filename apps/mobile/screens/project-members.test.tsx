import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { ProjectMembers, type MemberRow } from './project-members';

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

const owner: MemberRow = {
  userId: 'owner-id',
  displayName: 'Olivia Owner',
  phone: '+15551111111',
  role: 'owner',
  joinedAt: '2024-01-01T00:00:00.000Z',
};
const self: MemberRow = {
  userId: 'self-id',
  displayName: 'Self',
  phone: '+15552222222',
  role: 'editor',
  joinedAt: '2024-02-01T00:00:00.000Z',
};
const bob: MemberRow = {
  userId: 'bob-id',
  displayName: 'Bob',
  phone: '+15553333333',
  role: 'editor',
  joinedAt: '2024-02-15T00:00:00.000Z',
};

const defaults = {
  members: [owner, self, bob],
  currentUserId: 'self-id' as string | null,
  myRole: 'owner' as const,
  ownerId: 'owner-id',
  isLoading: false,
  refreshing: false,
  onRefresh: vi.fn(),
  onBack: vi.fn(),
  onAddMember: vi.fn(),
  isAddPending: false,
  addError: null,
  onRemoveMember: vi.fn(),
  isRemovePending: false,
};

describe('ProjectMembers', () => {
  it('renders owner-managed view with add-member affordance', () => {
    const tree = render(<ProjectMembers {...defaults} />);
    expect(() => tree.root.findByProps({ testID: 'btn-add-member' })).not.toThrow();
  });

  it('hides add-member affordance for non-owners', () => {
    const tree = render(<ProjectMembers {...defaults} myRole="editor" />);
    expect(tree.root.findAllByProps({ testID: 'btn-add-member' })).toHaveLength(0);
  });

  it('renders skeleton while loading', () => {
    const tree = render(<ProjectMembers {...defaults} isLoading />);
    expect(tree.root.findAllByProps({ testID: 'btn-add-member' })).toHaveLength(0);
  });

  it('opens the add-member form when the affordance is pressed', () => {
    const tree = render(<ProjectMembers {...defaults} />);
    act(() =>
      tree.root.findByProps({ testID: 'btn-add-member' }).props.onPress(),
    );
    expect(() => tree.root.findByProps({ testID: 'btn-invite-submit' })).not.toThrow();
  });

  it('refuses to submit invite without a phone number', () => {
    const onAdd = vi.fn();
    const tree = render(<ProjectMembers {...defaults} onAddMember={onAdd} />);
    act(() => tree.root.findByProps({ testID: 'btn-add-member' }).props.onPress());
    act(() => tree.root.findByProps({ testID: 'btn-invite-submit' }).props.onPress());
    expect(onAdd).not.toHaveBeenCalled();
    expect(collectText(tree.toJSON())).toContain('Phone number is required.');
  });

  it('submits invite with phone + default editor role', () => {
    const onAdd = vi.fn();
    const tree = render(<ProjectMembers {...defaults} onAddMember={onAdd} />);
    act(() => tree.root.findByProps({ testID: 'btn-add-member' }).props.onPress());
    act(() =>
      tree.root
        .findByProps({ testID: 'input-invite-phone' })
        .props.onChangeText('  +15554443333  '),
    );
    act(() => tree.root.findByProps({ testID: 'btn-invite-submit' }).props.onPress());
    expect(onAdd).toHaveBeenCalledWith({ phone: '+15554443333', role: 'editor' });
  });

  it('opens remove confirmation dialog for non-owner members when manager', () => {
    const tree = render(<ProjectMembers {...defaults} />);
    act(() =>
      tree.root
        .findByProps({ testID: `btn-remove-member-${bob.userId}` })
        .props.onPress(),
    );
    expect(collectText(tree.toJSON())).toContain('Remove Member');
  });

  it('does not render trash icon on owner row', () => {
    const tree = render(<ProjectMembers {...defaults} />);
    expect(
      tree.root.findAllByProps({ testID: `btn-remove-member-${owner.userId}` }),
    ).toHaveLength(0);
  });

  it('shows EmptyState when the only other member is filtered out (no teammates)', () => {
    const tree = render(
      <ProjectMembers
        {...defaults}
        members={[owner]}
        currentUserId={owner.userId}
        myRole="owner"
      />,
    );
    expect(collectText(tree.toJSON())).toContain('No team members yet');
  });
});
