/**
 * ProjectMembers screen body — props-only, no data fetching.
 *
 * Ported from `../haru3-reports/apps/mobile/app/projects/[projectId]/members.tsx`
 * on branch `dev`. Adapted for v4 contract:
 *   - 3 roles (owner / editor / viewer), not 4 (no admin)
 *   - Owner is computed by Project.ownerId === member.userId
 *   - Member fields: { userId, displayName, phone, role, joinedAt }
 *
 * Inline AddMemberForm + remove-confirm dialog keep this one body file
 * self-contained (no separate components/members/ tree to port).
 */
import { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Crown, Pencil, Eye, Plus, Trash2, Users } from 'lucide-react-native';
import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { EmptyState } from '@/components/primitives/EmptyState';
import { Input } from '@/components/primitives/Input';
import { InlineNotice } from '@/components/primitives/InlineNotice';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { ProjectMembersSkeleton } from '@/components/skeletons/ProjectMembersSkeleton';
import { getRemoveMemberDialogCopy } from '@/lib/app-dialog-copy';
import { colors } from '@/lib/design-tokens/colors';

export type MemberRole = 'owner' | 'editor' | 'viewer';

export type MemberRow = {
  userId: string;
  displayName: string | null;
  phone: string;
  role: MemberRole;
  joinedAt: string;
};

export type ProjectMembersProps = {
  members: ReadonlyArray<MemberRow>;
  currentUserId: string | null;
  myRole: MemberRole;
  ownerId: string;
  isLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
  onAddMember: (input: { phone: string; role: 'editor' | 'viewer' }) => void;
  isAddPending: boolean;
  addError: string | null;
  onRemoveMember: (userId: string) => void;
  isRemovePending: boolean;
};

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

const ROLE_ICONS: Record<MemberRole, typeof Crown> = {
  owner: Crown,
  editor: Pencil,
  viewer: Eye,
};

function RoleBadge({ role }: { role: MemberRole }) {
  const Icon = ROLE_ICONS[role];
  return (
    <View className="flex-row items-center gap-1 rounded-md border border-border bg-surface-muted px-2 py-0.5">
      <Icon size={12} color={colors.muted.foreground} />
      <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {ROLE_LABELS[role]}
      </Text>
    </View>
  );
}

function MemberItem({
  member,
  canRemove,
  onRemove,
}: {
  member: MemberRow;
  canRemove: boolean;
  onRemove?: () => void;
}) {
  const displayName = member.displayName ?? 'Unknown';
  return (
    <Card variant="default" padding="md" className="flex-row items-center gap-3">
      <View className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-muted">
        <Text className="text-sm font-bold text-muted-foreground">
          {displayName.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text
            className="text-base font-semibold text-foreground"
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <RoleBadge role={member.role} />
        </View>
        <Text className="text-sm text-muted-foreground" numberOfLines={1}>
          {member.phone}
        </Text>
      </View>
      {canRemove && onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Remove member"
          testID={`btn-remove-member-${member.userId}`}
        >
          <Trash2 size={18} color={colors.danger.DEFAULT} />
        </Pressable>
      ) : null}
    </Card>
  );
}

function AddMemberForm({
  onAdd,
  isPending,
  errorMessage,
}: {
  onAdd: (input: { phone: string; role: 'editor' | 'viewer' }) => void;
  isPending: boolean;
  errorMessage: string | null;
}) {
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [validation, setValidation] = useState<string | null>(null);

  const submit = () => {
    if (!phone.trim()) {
      setValidation('Phone number is required.');
      return;
    }
    setValidation(null);
    onAdd({ phone: phone.trim(), role });
  };

  return (
    <Card variant="muted" padding="md" className="gap-3">
      <Text className="text-title-sm text-foreground">Invite a teammate</Text>
      <Input
        label="Phone number"
        placeholder="+1 555 123 4567"
        value={phone}
        onChangeText={(v) => {
          setPhone(v);
          setValidation(null);
        }}
        editable={!isPending}
        keyboardType="phone-pad"
        testID="input-invite-phone"
      />
      <View className="flex-row gap-2">
        {(['editor', 'viewer'] as const).map((r) => (
          <Button
            key={r}
            variant={role === r ? 'default' : 'outline'}
            size="sm"
            onPress={() => setRole(r)}
            disabled={isPending}
            testID={`btn-invite-role-${r}`}
          >
            {ROLE_LABELS[r]}
          </Button>
        ))}
      </View>
      {validation ? (
        <InlineNotice tone="danger">{validation}</InlineNotice>
      ) : errorMessage ? (
        <InlineNotice tone="danger">{errorMessage}</InlineNotice>
      ) : null}
      <Button
        variant="default"
        size="default"
        onPress={submit}
        loading={isPending}
        testID="btn-invite-submit"
      >
        {isPending ? 'Inviting…' : 'Send invite'}
      </Button>
    </Card>
  );
}

export function ProjectMembers({
  members,
  currentUserId,
  myRole,
  ownerId,
  isLoading,
  refreshing,
  onRefresh,
  onBack,
  onAddMember,
  isAddPending,
  addError,
  onRemoveMember,
  isRemovePending,
}: ProjectMembersProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [roleFilter, setRoleFilter] = useState<MemberRole | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<MemberRow | null>(null);

  const canManage = myRole === 'owner';

  const enriched = useMemo(
    () =>
      members.map((m) => ({
        ...m,
        role: m.userId === ownerId ? ('owner' as MemberRole) : m.role,
      })),
    [members, ownerId],
  );

  const me = enriched.find((m) => m.userId === currentUserId) ?? null;
  const others = useMemo(
    () => enriched.filter((m) => m.userId !== currentUserId),
    [enriched, currentUserId],
  );

  const roleCounts = useMemo(() => {
    const c: Record<MemberRole, number> = { owner: 0, editor: 0, viewer: 0 };
    for (const m of others) c[m.role] += 1;
    return c;
  }, [others]);

  const filtered = useMemo(
    () => (roleFilter ? others.filter((m) => m.role === roleFilter) : others),
    [others, roleFilter],
  );

  const filterOptions: { key: MemberRole | null; label: string }[] = [
    { key: null, label: 'All' },
    ...(['owner', 'editor', 'viewer'] as const).map((r) => ({
      key: r,
      label: roleCounts[r] ? `${ROLE_LABELS[r]} (${roleCounts[r]})` : ROLE_LABELS[r],
    })),
  ];

  const removeCopy = memberToRemove
    ? getRemoveMemberDialogCopy(memberToRemove.displayName ?? 'this member')
    : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 pt-4 pb-2">
        <ScreenHeader title="Members" onBack={onBack} backLabel="Project" />
      </View>

      {isLoading ? (
        <ProjectMembersSkeleton />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 16,
            gap: 12,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {me ? (
            <MemberItem member={me} canRemove={false} />
          ) : null}

          {canManage ? (
            showAdd ? (
              <AddMemberForm
                onAdd={(input) => {
                  onAddMember(input);
                  if (!addError) setShowAdd(false);
                }}
                isPending={isAddPending}
                errorMessage={addError}
              />
            ) : (
              <Pressable
                onPress={() => setShowAdd(true)}
                accessibilityRole="button"
                accessibilityLabel="Add member"
                testID="btn-add-member"
              >
                <View className="flex-row items-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted p-3">
                  <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
                    <Plus size={20} color={colors.foreground} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-title-sm text-foreground">
                      Add member
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      Invite a teammate to this project.
                    </Text>
                  </View>
                </View>
              </Pressable>
            )
          ) : null}

          {others.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {filterOptions.map((opt) => {
                const active = roleFilter === opt.key;
                return (
                  <Pressable
                    key={opt.key ?? 'all'}
                    onPress={() => setRoleFilter(opt.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    testID={`btn-filter-${opt.key ?? 'all'}`}
                  >
                    <View
                      className={`rounded-lg border px-4 py-2 ${
                        active
                          ? 'border-primary bg-primary'
                          : 'border-border bg-card'
                      }`}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          active ? 'text-primary-foreground' : 'text-foreground'
                        }`}
                      >
                        {opt.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {filtered.length === 0 ? (
            !roleFilter ? (
              <EmptyState
                icon={<Users size={28} color={colors.muted.foreground} />}
                title="No team members yet"
                description="Add teammates so they can view or contribute to this project's reports."
              />
            ) : null
          ) : (
            <View className="gap-3">
              {filtered.map((member) => (
                <MemberItem
                  key={member.userId}
                  member={member}
                  canRemove={canManage && member.role !== 'owner'}
                  onRemove={() => setMemberToRemove(member)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {removeCopy && memberToRemove ? (
        <AppDialogSheet
          visible
          title={removeCopy.title}
          message={removeCopy.message}
          noticeTone={removeCopy.tone}
          noticeTitle={removeCopy.noticeTitle}
          onClose={() => (!isRemovePending ? setMemberToRemove(null) : undefined)}
          canDismiss={!isRemovePending}
          actions={[
            {
              label: isRemovePending ? 'Removing…' : removeCopy.confirmLabel,
              variant: removeCopy.confirmVariant,
              disabled: isRemovePending,
              onPress: () => {
                onRemoveMember(memberToRemove.userId);
                setMemberToRemove(null);
              },
            },
            {
              label: removeCopy.cancelLabel ?? 'Cancel',
              variant: 'quiet',
              disabled: isRemovePending,
              onPress: () => setMemberToRemove(null),
            },
          ]}
        />
      ) : null}
    </SafeAreaView>
  );
}

export default ProjectMembers;
