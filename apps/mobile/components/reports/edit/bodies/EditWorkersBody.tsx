/**
 * EditWorkersBody — totalWorkers + workerHours + notes + roles list.
 *
 * Whole-list per the design: one pencil edits everything in this card.
 */
import { Text, TextInput, View } from 'react-native';
import type { GeneratedReportWorkers } from '@harpa/report-core';

import { blankRole } from '@/lib/reports/report-edit-helpers';

import {
  AddRowButton,
  Field,
  INPUT_CLASS,
  MULTILINE_CLASS,
  nullableString,
  nullify,
  numericString,
  parseNumeric,
  RemoveRowButton,
  ROW_CLASS,
} from './fields';

interface Props {
  value: GeneratedReportWorkers;
  onChange: (next: GeneratedReportWorkers) => void;
}

export function EditWorkersBody({ value, onChange }: Props) {
  const roles = value.roles;
  return (
    <View className="gap-3">
      <Field label="Total workers">
        <TextInput
          className={INPUT_CLASS}
          value={numericString(value.totalWorkers)}
          onChangeText={(v) => onChange({ ...value, totalWorkers: parseNumeric(v) })}
          keyboardType="numeric"
          accessibilityLabel="Total workers"
          testID="input-edit-workers-total"
        />
      </Field>
      <Field label="Worker hours">
        <TextInput
          className={INPUT_CLASS}
          value={nullableString(value.workerHours)}
          onChangeText={(v) => onChange({ ...value, workerHours: nullify(v) })}
          accessibilityLabel="Worker hours"
          testID="input-edit-workers-hours"
        />
      </Field>
      <Field label="Notes">
        <TextInput
          className={MULTILINE_CLASS}
          value={nullableString(value.notes)}
          onChangeText={(v) => onChange({ ...value, notes: nullify(v) })}
          multiline
          accessibilityLabel="Workers notes"
          testID="input-edit-workers-notes"
        />
      </Field>

      <Text className="mt-2 text-sm font-semibold text-foreground">Roles</Text>
      {roles.length === 0 ? (
        <Text className="text-sm text-muted-foreground opacity-60">No roles yet</Text>
      ) : (
        roles.map((role, idx) => (
          <View key={`role-${idx}`} className={ROW_CLASS} testID={`edit-role-row-${idx}`}>
            <Field label="Role">
              <TextInput
                className={INPUT_CLASS}
                value={role.role}
                onChangeText={(v) => {
                  const next = roles.slice();
                  next[idx] = { ...next[idx]!, role: v };
                  onChange({ ...value, roles: next });
                }}
                accessibilityLabel={`Role ${idx + 1} title`}
                testID={`input-edit-role-${idx}-title`}
              />
            </Field>
            <Field label="Count">
              <TextInput
                className={INPUT_CLASS}
                value={numericString(role.count)}
                onChangeText={(v) => {
                  const next = roles.slice();
                  next[idx] = { ...next[idx]!, count: parseNumeric(v) };
                  onChange({ ...value, roles: next });
                }}
                keyboardType="numeric"
                accessibilityLabel={`Role ${idx + 1} count`}
                testID={`input-edit-role-${idx}-count`}
              />
            </Field>
            <Field label="Notes">
              <TextInput
                className={INPUT_CLASS}
                value={nullableString(role.notes)}
                onChangeText={(v) => {
                  const next = roles.slice();
                  next[idx] = { ...next[idx]!, notes: nullify(v) };
                  onChange({ ...value, roles: next });
                }}
                accessibilityLabel={`Role ${idx + 1} notes`}
                testID={`input-edit-role-${idx}-notes`}
              />
            </Field>
            <RemoveRowButton
              label={`Remove role ${idx + 1}`}
              testID={`btn-edit-role-${idx}-remove`}
              onPress={() =>
                onChange({
                  ...value,
                  roles: roles.filter((_, i) => i !== idx),
                })
              }
            />
          </View>
        ))
      )}
      <AddRowButton
        label="Add role"
        testID="btn-edit-workers-add-role"
        onPress={() => onChange({ ...value, roles: [...roles, blankRole()] })}
      />
    </View>
  );
}
