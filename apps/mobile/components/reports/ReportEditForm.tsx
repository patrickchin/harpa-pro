/**
 * ReportEditForm — inline, per-section editor for a `GeneratedSiteReport`.
 *
 * Ported verbatim from
 * `../haru3-reports/apps/mobile/components/reports/ReportEditForm.tsx`
 * on branch `dev`. Both apps run NativeWind v4 so the JSX + Tailwind
 * classes copy across. The only structural changes are the import
 * paths: `@/lib/generated-report` → `@harpa/report-core` (shared
 * package) and the dialog primitive moves to `@/components/primitives`.
 *
 * The form is a pure controlled component: it never holds the report
 * in local state, only the destructive-confirm dialog. Every edit
 * flows through `onChange(next)` via the immutable helpers in
 * `lib/report-edit-helpers.ts`, so consumers can drive autosave,
 * undo, or anything else off the resulting object identity.
 *
 * The dialog uses `AppDialogSheet` (hard rule: no `Alert.alert`).
 */
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';

import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { Card } from '@/components/primitives/Card';
import { SectionHeader } from '@/components/primitives/SectionHeader';
import { colors } from '@/lib/design-tokens/colors';
import {
  blankIssue,
  blankMaterial,
  blankRole,
  blankSection,
  setIssues,
  setMaterials,
  setNextSteps,
  setRoles,
  setSections,
  updateMeta,
  updateWeather,
  updateWorkers,
} from '@/lib/report-edit-helpers';
import type { GeneratedSiteReport } from '@harpa/report-core';

export interface ReportEditFormProps {
  report: GeneratedSiteReport;
  onChange: (next: GeneratedSiteReport) => void;
}

const INPUT_CLASS =
  'rounded-md border border-border bg-card px-3 py-2 text-base text-foreground';
const MULTILINE_CLASS = `${INPUT_CLASS} min-h-[88px]`;
const LABEL_CLASS = 'text-sm font-medium text-muted-foreground';
const FIELD_CLASS = 'gap-1';
const ROW_CLASS = 'gap-2 rounded-md border border-border bg-surface-muted p-3';

function parseNumeric(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numericString(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function nullableString(value: string | null | undefined): string {
  return value ?? '';
}

function nullify(value: string): string | null {
  return value.trim() === '' ? null : value;
}

interface PendingRemoval {
  message: string;
  onConfirm: () => void;
}

export function ReportEditForm({ report, onChange }: ReportEditFormProps) {
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(
    null,
  );

  const r = report.report;
  const meta = r.meta;
  const weather = r.weather;
  const workers = r.workers;
  const roles = workers?.roles ?? [];
  const materials = r.materials;
  const issues = r.issues;
  const nextSteps = r.nextSteps;
  const sections = r.sections;

  const requestRemove = (message: string, onConfirm: () => void) => {
    setPendingRemoval({ message, onConfirm });
  };

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
      {/* ── 1. Meta ──────────────────────────────────────────── */}
      <Card variant="default" padding="lg" testID="edit-section-meta">
        <SectionHeader title="Project" subtitle="Report meta" />
        <View className="mt-4 gap-3">
          <Field label="Title">
            <TextInput
              className={INPUT_CLASS}
              value={meta.title}
              onChangeText={(v) => onChange(updateMeta(report, { title: v }))}
              accessibilityLabel="Report title"
            />
          </Field>
          <Field label="Report type">
            <TextInput
              className={INPUT_CLASS}
              value={meta.reportType}
              onChangeText={(v) =>
                onChange(updateMeta(report, { reportType: v }))
              }
              accessibilityLabel="Report type"
            />
          </Field>
          <Field label="Visit date">
            <TextInput
              className={INPUT_CLASS}
              value={nullableString(meta.visitDate)}
              onChangeText={(v) =>
                onChange(updateMeta(report, { visitDate: nullify(v) }))
              }
              placeholder="YYYY-MM-DD"
              accessibilityLabel="Visit date"
            />
          </Field>
          <Field label="Summary">
            <TextInput
              className={MULTILINE_CLASS}
              value={meta.summary}
              onChangeText={(v) => onChange(updateMeta(report, { summary: v }))}
              multiline
              accessibilityLabel="Report summary"
            />
          </Field>
        </View>
      </Card>

      {/* ── 2. Weather ───────────────────────────────────────── */}
      <Card variant="default" padding="lg" testID="edit-section-weather">
        <SectionHeader title="Weather" />
        <View className="mt-4 gap-3">
          <Field label="Conditions">
            <TextInput
              className={INPUT_CLASS}
              value={nullableString(weather?.conditions)}
              onChangeText={(v) =>
                onChange(updateWeather(report, { conditions: nullify(v) }))
              }
              accessibilityLabel="Weather conditions"
            />
          </Field>
          <Field label="Temperature">
            <TextInput
              className={INPUT_CLASS}
              value={nullableString(weather?.temperature)}
              onChangeText={(v) =>
                onChange(updateWeather(report, { temperature: nullify(v) }))
              }
              accessibilityLabel="Weather temperature"
            />
          </Field>
          <Field label="Wind">
            <TextInput
              className={INPUT_CLASS}
              value={nullableString(weather?.wind)}
              onChangeText={(v) =>
                onChange(updateWeather(report, { wind: nullify(v) }))
              }
              accessibilityLabel="Weather wind"
            />
          </Field>
          <Field label="Impact">
            <TextInput
              className={MULTILINE_CLASS}
              value={nullableString(weather?.impact)}
              onChangeText={(v) =>
                onChange(updateWeather(report, { impact: nullify(v) }))
              }
              multiline
              accessibilityLabel="Weather impact"
            />
          </Field>
        </View>
      </Card>

      {/* ── 3. Workers ───────────────────────────────────────── */}
      <Card variant="default" padding="lg" testID="edit-section-workers">
        <SectionHeader title="Workers" />
        <View className="mt-4 gap-3">
          <Field label="Total workers">
            <TextInput
              className={INPUT_CLASS}
              value={numericString(workers?.totalWorkers ?? null)}
              onChangeText={(v) =>
                onChange(updateWorkers(report, { totalWorkers: parseNumeric(v) }))
              }
              keyboardType="numeric"
              accessibilityLabel="Total workers"
            />
          </Field>
          <Field label="Worker hours">
            <TextInput
              className={INPUT_CLASS}
              value={nullableString(workers?.workerHours)}
              onChangeText={(v) =>
                onChange(updateWorkers(report, { workerHours: nullify(v) }))
              }
              accessibilityLabel="Worker hours"
            />
          </Field>
          <Field label="Notes">
            <TextInput
              className={MULTILINE_CLASS}
              value={nullableString(workers?.notes)}
              onChangeText={(v) =>
                onChange(updateWorkers(report, { notes: nullify(v) }))
              }
              multiline
              accessibilityLabel="Workers notes"
            />
          </Field>

          <Text className="mt-2 text-sm font-semibold text-foreground">
            Roles
          </Text>
          {roles.length === 0 ? (
            <Text className="text-sm text-muted-foreground opacity-60">
              No roles yet
            </Text>
          ) : (
            roles.map((role, idx) => (
              <View
                key={`role-${idx}`}
                className={ROW_CLASS}
                testID={`role-row-${idx}`}
              >
                <Field label="Role">
                  <TextInput
                    className={INPUT_CLASS}
                    value={role.role}
                    onChangeText={(v) => {
                      const next = roles.slice();
                      next[idx] = { ...next[idx]!, role: v };
                      onChange(setRoles(report, next));
                    }}
                    accessibilityLabel={`Role ${idx + 1} title`}
                  />
                </Field>
                <Field label="Count">
                  <TextInput
                    className={INPUT_CLASS}
                    value={numericString(role.count)}
                    onChangeText={(v) => {
                      const next = roles.slice();
                      next[idx] = { ...next[idx]!, count: parseNumeric(v) };
                      onChange(setRoles(report, next));
                    }}
                    keyboardType="numeric"
                    accessibilityLabel={`Role ${idx + 1} count`}
                  />
                </Field>
                <Field label="Notes">
                  <TextInput
                    className={INPUT_CLASS}
                    value={nullableString(role.notes)}
                    onChangeText={(v) => {
                      const next = roles.slice();
                      next[idx] = { ...next[idx]!, notes: nullify(v) };
                      onChange(setRoles(report, next));
                    }}
                    accessibilityLabel={`Role ${idx + 1} notes`}
                  />
                </Field>
                <RemoveRowButton
                  label={`Remove role ${idx + 1}`}
                  onPress={() =>
                    requestRemove('Remove this worker role?', () => {
                      onChange(
                        setRoles(report, roles.filter((_, i) => i !== idx)),
                      );
                    })
                  }
                />
              </View>
            ))
          )}
          <AddRowButton
            label="Add role"
            onPress={() => onChange(setRoles(report, [...roles, blankRole()]))}
          />
        </View>
      </Card>

      {/* ── 4. Materials ─────────────────────────────────────── */}
      <Card variant="default" padding="lg" testID="edit-section-materials">
        <SectionHeader title="Materials" />
        <View className="mt-4 gap-3">
          {materials.length === 0 ? (
            <Text className="text-sm text-muted-foreground opacity-60">
              No materials yet
            </Text>
          ) : (
            materials.map((mat, idx) => (
              <View
                key={`mat-${idx}`}
                className={ROW_CLASS}
                testID={`material-row-${idx}`}
              >
                <Field label="Name">
                  <TextInput
                    className={INPUT_CLASS}
                    value={mat.name}
                    onChangeText={(v) => {
                      const next = materials.slice();
                      next[idx] = { ...next[idx]!, name: v };
                      onChange(setMaterials(report, next));
                    }}
                    accessibilityLabel={`Material ${idx + 1} name`}
                  />
                </Field>
                <Field label="Quantity">
                  <TextInput
                    className={INPUT_CLASS}
                    value={nullableString(mat.quantity)}
                    onChangeText={(v) => {
                      const next = materials.slice();
                      next[idx] = { ...next[idx]!, quantity: nullify(v) };
                      onChange(setMaterials(report, next));
                    }}
                    accessibilityLabel={`Material ${idx + 1} quantity`}
                  />
                </Field>
                <Field label="Unit">
                  <TextInput
                    className={INPUT_CLASS}
                    value={nullableString(mat.quantityUnit)}
                    onChangeText={(v) => {
                      const next = materials.slice();
                      next[idx] = { ...next[idx]!, quantityUnit: nullify(v) };
                      onChange(setMaterials(report, next));
                    }}
                    accessibilityLabel={`Material ${idx + 1} unit`}
                  />
                </Field>
                <Field label="Condition">
                  <TextInput
                    className={INPUT_CLASS}
                    value={nullableString(mat.condition)}
                    onChangeText={(v) => {
                      const next = materials.slice();
                      next[idx] = { ...next[idx]!, condition: nullify(v) };
                      onChange(setMaterials(report, next));
                    }}
                    accessibilityLabel={`Material ${idx + 1} condition`}
                  />
                </Field>
                <Field label="Status">
                  <TextInput
                    className={INPUT_CLASS}
                    value={nullableString(mat.status)}
                    onChangeText={(v) => {
                      const next = materials.slice();
                      next[idx] = { ...next[idx]!, status: nullify(v) };
                      onChange(setMaterials(report, next));
                    }}
                    accessibilityLabel={`Material ${idx + 1} status`}
                  />
                </Field>
                <Field label="Notes">
                  <TextInput
                    className={INPUT_CLASS}
                    value={nullableString(mat.notes)}
                    onChangeText={(v) => {
                      const next = materials.slice();
                      next[idx] = { ...next[idx]!, notes: nullify(v) };
                      onChange(setMaterials(report, next));
                    }}
                    accessibilityLabel={`Material ${idx + 1} notes`}
                  />
                </Field>
                <RemoveRowButton
                  label={`Remove material ${idx + 1}`}
                  onPress={() =>
                    requestRemove('Remove this material?', () => {
                      onChange(
                        setMaterials(
                          report,
                          materials.filter((_, i) => i !== idx),
                        ),
                      );
                    })
                  }
                />
              </View>
            ))
          )}
          <AddRowButton
            label="Add material"
            onPress={() =>
              onChange(setMaterials(report, [...materials, blankMaterial()]))
            }
          />
        </View>
      </Card>

      {/* ── 5. Issues ────────────────────────────────────────── */}
      <Card variant="default" padding="lg" testID="edit-section-issues">
        <SectionHeader title="Issues" />
        <View className="mt-4 gap-3">
          {issues.length === 0 ? (
            <Text className="text-sm text-muted-foreground opacity-60">
              No issues yet
            </Text>
          ) : (
            issues.map((iss, idx) => (
              <View
                key={`iss-${idx}`}
                className={ROW_CLASS}
                testID={`issue-row-${idx}`}
              >
                <Field label="Title">
                  <TextInput
                    className={INPUT_CLASS}
                    value={iss.title}
                    onChangeText={(v) => {
                      const next = issues.slice();
                      next[idx] = { ...next[idx]!, title: v };
                      onChange(setIssues(report, next));
                    }}
                    accessibilityLabel={`Issue ${idx + 1} title`}
                  />
                </Field>
                <Field label="Category">
                  <TextInput
                    className={INPUT_CLASS}
                    value={iss.category}
                    onChangeText={(v) => {
                      const next = issues.slice();
                      next[idx] = { ...next[idx]!, category: v };
                      onChange(setIssues(report, next));
                    }}
                    accessibilityLabel={`Issue ${idx + 1} category`}
                  />
                </Field>
                <Field label="Severity (low/medium/high)">
                  <TextInput
                    className={INPUT_CLASS}
                    value={iss.severity}
                    onChangeText={(v) => {
                      const next = issues.slice();
                      next[idx] = { ...next[idx]!, severity: v };
                      onChange(setIssues(report, next));
                    }}
                    accessibilityLabel={`Issue ${idx + 1} severity`}
                  />
                </Field>
                <Field label="Status">
                  <TextInput
                    className={INPUT_CLASS}
                    value={iss.status}
                    onChangeText={(v) => {
                      const next = issues.slice();
                      next[idx] = { ...next[idx]!, status: v };
                      onChange(setIssues(report, next));
                    }}
                    accessibilityLabel={`Issue ${idx + 1} status`}
                  />
                </Field>
                <Field label="Details">
                  <TextInput
                    className={MULTILINE_CLASS}
                    value={iss.details}
                    onChangeText={(v) => {
                      const next = issues.slice();
                      next[idx] = { ...next[idx]!, details: v };
                      onChange(setIssues(report, next));
                    }}
                    multiline
                    accessibilityLabel={`Issue ${idx + 1} details`}
                  />
                </Field>
                <Field label="Action required">
                  <TextInput
                    className={INPUT_CLASS}
                    value={nullableString(iss.actionRequired)}
                    onChangeText={(v) => {
                      const next = issues.slice();
                      next[idx] = {
                        ...next[idx]!,
                        actionRequired: nullify(v),
                      };
                      onChange(setIssues(report, next));
                    }}
                    accessibilityLabel={`Issue ${idx + 1} action required`}
                  />
                </Field>
                <RemoveRowButton
                  label={`Remove issue ${idx + 1}`}
                  onPress={() =>
                    requestRemove('Remove this issue?', () => {
                      onChange(
                        setIssues(report, issues.filter((_, i) => i !== idx)),
                      );
                    })
                  }
                />
              </View>
            ))
          )}
          <AddRowButton
            label="Add issue"
            onPress={() =>
              onChange(setIssues(report, [...issues, blankIssue()]))
            }
          />
        </View>
      </Card>

      {/* ── 6. Next Steps ────────────────────────────────────── */}
      <Card variant="default" padding="lg" testID="edit-section-next-steps">
        <SectionHeader title="Next Steps" />
        <View className="mt-4 gap-3">
          {nextSteps.length === 0 ? (
            <Text className="text-sm text-muted-foreground opacity-60">
              No next steps yet
            </Text>
          ) : (
            nextSteps.map((step, idx) => (
              <View
                key={`step-${idx}`}
                className={ROW_CLASS}
                testID={`next-step-row-${idx}`}
              >
                <Field label={`Step ${idx + 1}`}>
                  <TextInput
                    className={MULTILINE_CLASS}
                    value={step}
                    onChangeText={(v) => {
                      const next = nextSteps.slice();
                      next[idx] = v;
                      onChange(setNextSteps(report, next));
                    }}
                    multiline
                    accessibilityLabel={`Next step ${idx + 1}`}
                  />
                </Field>
                <RemoveRowButton
                  label={`Remove next step ${idx + 1}`}
                  onPress={() =>
                    requestRemove('Remove this next step?', () => {
                      onChange(
                        setNextSteps(
                          report,
                          nextSteps.filter((_, i) => i !== idx),
                        ),
                      );
                    })
                  }
                />
              </View>
            ))
          )}
          <AddRowButton
            label="Add next step"
            onPress={() => onChange(setNextSteps(report, [...nextSteps, '']))}
          />
        </View>
      </Card>

      {/* ── 7. Summary Sections ──────────────────────────────── */}
      <Card variant="default" padding="lg" testID="edit-section-sections">
        <SectionHeader title="Summary Sections" />
        <View className="mt-4 gap-3">
          {sections.length === 0 ? (
            <Text className="text-sm text-muted-foreground opacity-60">
              No summary sections yet
            </Text>
          ) : (
            sections.map((sec, idx) => (
              <View
                key={`sec-${idx}`}
                className={ROW_CLASS}
                testID={`section-row-${idx}`}
              >
                <Field label="Heading">
                  <TextInput
                    className={INPUT_CLASS}
                    value={sec.title}
                    onChangeText={(v) => {
                      const next = sections.slice();
                      next[idx] = { ...next[idx]!, title: v };
                      onChange(setSections(report, next));
                    }}
                    accessibilityLabel={`Section ${idx + 1} heading`}
                  />
                </Field>
                <Field label="Body">
                  <TextInput
                    className={MULTILINE_CLASS}
                    value={sec.content}
                    onChangeText={(v) => {
                      const next = sections.slice();
                      next[idx] = { ...next[idx]!, content: v };
                      onChange(setSections(report, next));
                    }}
                    multiline
                    accessibilityLabel={`Section ${idx + 1} body`}
                  />
                </Field>
                <RemoveRowButton
                  label={`Remove section ${idx + 1}`}
                  onPress={() =>
                    requestRemove('Remove this summary section?', () => {
                      onChange(
                        setSections(
                          report,
                          sections.filter((_, i) => i !== idx),
                        ),
                      );
                    })
                  }
                />
              </View>
            ))
          )}
          <AddRowButton
            label="Add section"
            onPress={() =>
              onChange(setSections(report, [...sections, blankSection()]))
            }
          />
        </View>
      </Card>

      <AppDialogSheet
        visible={pendingRemoval !== null}
        title="Remove row?"
        message={pendingRemoval?.message ?? ''}
        noticeTone="danger"
        onClose={() => setPendingRemoval(null)}
        actions={[
          {
            label: 'Remove',
            variant: 'destructive',
            align: 'start',
            onPress: () => {
              pendingRemoval?.onConfirm();
              setPendingRemoval(null);
            },
            accessibilityLabel: 'Confirm remove row',
          },
          {
            label: 'Cancel',
            variant: 'quiet',
            onPress: () => setPendingRemoval(null),
            accessibilityLabel: 'Cancel remove row',
          },
        ]}
      />
    </ScrollView>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className={FIELD_CLASS}>
      <Text className={LABEL_CLASS}>{label}</Text>
      {children}
    </View>
  );
}

function AddRowButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 active:bg-muted"
    >
      <Plus size={16} color={colors.foreground} />
      <Text className="text-base font-medium text-foreground">{label}</Text>
    </Pressable>
  );
}

function RemoveRowButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="mt-1 flex-row items-center gap-2 self-end rounded-md px-2 py-1 active:bg-muted"
    >
      <Trash2 size={14} color={colors.danger.DEFAULT} />
      <Text className="text-sm font-medium text-destructive">Remove</Text>
    </Pressable>
  );
}
