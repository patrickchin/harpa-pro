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
  email: 'olivia@example.com',
  role: 'owner',
  joinedAt: '2024-01-01T00:00:00.000Z',
};
const self: MemberRow = {
  userId: 'self-id',
  displayName: 'Self',
  email: 'self@example.com',
  role: 'editor',
  joinedAt: '2024-02-01T00:00:00.000Z',
};
const bob: MemberRow = {
  userId: 'bob-id',
  displayName: 'Bob',
  email: 'bob@example.com',
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
  addSuccessNonce: 0,
  onRemoveMember: vi.fn(),
  isRemovePending: false,
};

describe('ProjectMembers', () => {
  it('renders owner-managed view with add-member affordance', () => {
    const tree = render(<ProjectMembers {...defaults} />);
    expect(() => tree.root.findByProps({ testID: 'btn-show-add-member' })).not.toThrow();
  });

  it('hides add-member affordance for non-owners', () => {
    const tree = render(<ProjectMembers {...defaults} myRole="editor" />);
    expect(tree.root.findAllByProps({ testID: 'btn-show-add-member' })).toHaveLength(0);
  });

  it('renders skeleton while loading', () => {
    const tree = render(<ProjectMembers {...defaults} isLoading />);
    expect(tree.root.findAllByProps({ testID: 'btn-show-add-member' })).toHaveLength(0);
  });

  it('opens the add-member form when the affordance is pressed', () => {
    const tree = render(<ProjectMembers {...defaults} />);
    act(() =>
      tree.root.findByProps({ testID: 'btn-show-add-member' }).props.onPress(),
    );
    // After toggling, the submit button is now visible inside the form.
    expect(() => tree.root.findByProps({ testID: "btn-add-member" })).not.toThrow();
  });

  it('refuses to submit invite without an email address', () => {
    const onAdd = vi.fn();
    const tree = render(<ProjectMembers {...defaults} onAddMember={onAdd} />);
    act(() => tree.root.findByProps({ testID: 'btn-show-add-member' }).props.onPress());
    act(() => tree.root.findByProps({ testID: "btn-add-member" }).props.onPress());
    expect(onAdd).not.toHaveBeenCalled();
    expect(collectText(tree.toJSON())).toContain('Email address is required.');
  });

  it('submits invite with email + default editor role', () => {
    const onAdd = vi.fn();
    const tree = render(<ProjectMembers {...defaults} onAddMember={onAdd} />);
    act(() => tree.root.findByProps({ testID: 'btn-show-add-member' }).props.onPress());
    act(() =>
      tree.root
        .findByProps({ testID: "input-member-email" })
        .props.onChangeText('  Carol@Example.com  '),
    );
    act(() => tree.root.findByProps({ testID: "btn-add-member" }).props.onPress());
    expect(onAdd).toHaveBeenCalledWith({ email: 'carol@example.com', role: 'editor' });
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

  it('keeps invite form open when the mutation fails (error stays visible)', () => {
    const tree = render(
      <ProjectMembers {...defaults} addError="User not found." />,
    );
    act(() => tree.root.findByProps({ testID: 'btn-show-add-member' }).props.onPress());
    act(() =>
      tree.root
        .findByProps({ testID: "input-member-email" })
        .props.onChangeText('newuser@example.com'),
    );
    act(() => tree.root.findByProps({ testID: "btn-add-member" }).props.onPress());
    // Form still mounted and error notice still rendered.
    expect(() =>
      tree.root.findByProps({ testID: "btn-add-member" }),
    ).not.toThrow();
    expect(collectText(tree.toJSON())).toContain('User not found.');
  });

  it('closes invite form when addSuccessNonce increments (success)', () => {
    const tree = render(<ProjectMembers {...defaults} />);
    act(() => tree.root.findByProps({ testID: 'btn-show-add-member' }).props.onPress());
    expect(() =>
      tree.root.findByProps({ testID: "btn-add-member" }),
    ).not.toThrow();
    act(() => {
      tree.update(<ProjectMembers {...defaults} addSuccessNonce={1} />);
    });
    // Submit btn gone — form collapsed.
    expect(
      tree.root.findAllByProps({ testID: "btn-add-member" }),
    ).toHaveLength(0);
    // Affordance toggle is back.
    expect(() =>
      tree.root.findByProps({ testID: 'btn-show-add-member' }),
    ).not.toThrow();
  });
});
