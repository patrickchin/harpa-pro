/**
 * EditWorkersBody — worker-role rows only. Derived totals stay derived.
 */
import { Text, TextInput, View } from 'react-native';
import { reports } from '@harpa/api-contract';

import {
  AddRowButton,
  Field,
  INPUT_CLASS,
  MULTILINE_CLASS,
  nullableString,
  nullify,
  RemoveRowButton,
  ROW_CLASS,
} from './fields';

interface Props {
  value: reports.ReportBody['workers'];
  onChange: (next: reports.ReportBody['workers']) => void;
}

function blankWorker(): reports.ReportBody['workers'][number] {
  return { role: '', count: null, hours: null, notes: null };
}

export function EditWorkersBody({ value, onChange }: Props) {
  return (
    <View className="gap-3">
      <Text className="text-sm font-semibold text-foreground">Workers</Text>
      {value.length === 0 ? (
        <Text className="text-sm text-muted-foreground opacity-60">No workers yet</Text>
      ) : (
        value.map((worker, idx) => (
          <View key={`role-${idx}`} className={ROW_CLASS} testID={`edit-role-row-${idx}`}>
            <Field label="Role">
              <TextInput
                className={INPUT_CLASS}
                value={worker.role}
                onChangeText={(v) => {
                  const next = value.slice();
                  next[idx] = { ...next[idx]!, role: v };
                  onChange(next);
                }}
                accessibilityLabel={`Role ${idx + 1} title`}
                testID={`input-edit-role-${idx}-title`}
              />
            </Field>
            <Field label="Count">
              <TextInput
                className={INPUT_CLASS}
                value={nullableString(worker.count)}
                onChangeText={(v) => {
                  const next = value.slice();
                  next[idx] = { ...next[idx]!, count: nullify(v) };
                  onChange(next);
                }}
                accessibilityLabel={`Role ${idx + 1} count`}
                testID={`input-edit-role-${idx}-count`}
              />
            </Field>
            <Field label="Hours">
              <TextInput
                className={INPUT_CLASS}
                value={nullableString(worker.hours)}
                onChangeText={(v) => {
                  const next = value.slice();
                  next[idx] = { ...next[idx]!, hours: nullify(v) };
                  onChange(next);
                }}
                accessibilityLabel={`Role ${idx + 1} hours`}
                testID={`input-edit-role-${idx}-hours`}
              />
            </Field>
            <Field label="Notes">
              <TextInput
                className={INPUT_CLASS}
                value={nullableString(worker.notes)}
                onChangeText={(v) => {
                  const next = value.slice();
                  next[idx] = { ...next[idx]!, notes: nullify(v) };
                  onChange(next);
                }}
                accessibilityLabel={`Role ${idx + 1} notes`}
                testID={`input-edit-role-${idx}-notes`}
              />
            </Field>
            <RemoveRowButton
              label={`Remove role ${idx + 1}`}
              testID={`btn-edit-role-${idx}-remove`}
              onPress={() =>
                onChange(value.filter((_, i) => i !== idx))
              }
            />
          </View>
        ))
      )}
      <AddRowButton
        label="Add worker"
        testID="btn-edit-workers-add-role"
        onPress={() => onChange([...value, blankWorker()])}
      />
    </View>
  );
}
