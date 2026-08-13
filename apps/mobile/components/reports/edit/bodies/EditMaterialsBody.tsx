/**
 * EditMaterialsBody — whole materials list (name, quantity, unit,
 * condition, status, notes), with add / remove rows.
 */
import { Text, TextInput, View } from 'react-native';
import { reports } from '@harpa/api-contract';

import {
  AddRowButton,
  Field,
  INPUT_CLASS,
  nullableString,
  nullify,
  RemoveRowButton,
  ROW_CLASS,
} from './fields';

interface Props {
  value: reports.ReportBody['materials'];
  onChange: (next: reports.ReportBody['materials']) => void;
}

function blankMaterial(): reports.ReportBody['materials'][number] {
  return {
    name: '',
    quantity: null,
    unit: null,
    condition: null,
    status: null,
    notes: null,
  };
}

export function EditMaterialsBody({ value, onChange }: Props) {
  return (
    <View className="gap-3">
      {value.length === 0 ? (
        <Text className="text-sm text-muted-foreground opacity-60">No materials yet</Text>
      ) : (
        value.map((mat, idx) => (
          <View key={`mat-${idx}`} className={ROW_CLASS} testID={`edit-material-row-${idx}`}>
            <Field label="Name">
              <TextInput
                className={INPUT_CLASS}
                value={mat.name}
                onChangeText={(v) => {
                  const next = value.slice();
                  next[idx] = { ...next[idx]!, name: v };
                  onChange(next);
                }}
                accessibilityLabel={`Material ${idx + 1} name`}
                testID={`input-edit-material-${idx}-name`}
              />
            </Field>
            <Field label="Quantity">
              <TextInput
                className={INPUT_CLASS}
                value={nullableString(mat.quantity)}
                onChangeText={(v) => {
                  const next = value.slice();
                  next[idx] = { ...next[idx]!, quantity: nullify(v) };
                  onChange(next);
                }}
                accessibilityLabel={`Material ${idx + 1} quantity`}
                testID={`input-edit-material-${idx}-quantity`}
              />
            </Field>
            <Field label="Unit">
              <TextInput
                className={INPUT_CLASS}
                value={nullableString(mat.unit)}
                onChangeText={(v) => {
                  const next = value.slice();
                  next[idx] = { ...next[idx]!, unit: nullify(v) };
                  onChange(next);
                }}
                accessibilityLabel={`Material ${idx + 1} unit`}
                testID={`input-edit-material-${idx}-unit`}
              />
            </Field>
            <Field label="Condition">
              <TextInput
                className={INPUT_CLASS}
                value={nullableString(mat.condition)}
                onChangeText={(v) => {
                  const next = value.slice();
                  next[idx] = { ...next[idx]!, condition: nullify(v) };
                  onChange(next);
                }}
                accessibilityLabel={`Material ${idx + 1} condition`}
                testID={`input-edit-material-${idx}-condition`}
              />
            </Field>
            <Field label="Status">
              <TextInput
                className={INPUT_CLASS}
                value={nullableString(mat.status)}
                onChangeText={(v) => {
                  const next = value.slice();
                  next[idx] = { ...next[idx]!, status: nullify(v) };
                  onChange(next);
                }}
                accessibilityLabel={`Material ${idx + 1} status`}
                testID={`input-edit-material-${idx}-status`}
              />
            </Field>
            <Field label="Notes">
              <TextInput
                className={INPUT_CLASS}
                value={nullableString(mat.notes)}
                onChangeText={(v) => {
                  const next = value.slice();
                  next[idx] = { ...next[idx]!, notes: nullify(v) };
                  onChange(next);
                }}
                accessibilityLabel={`Material ${idx + 1} notes`}
                testID={`input-edit-material-${idx}-notes`}
              />
            </Field>
            <RemoveRowButton
              label={`Remove material ${idx + 1}`}
              testID={`btn-edit-material-${idx}-remove`}
              onPress={() => onChange(value.filter((_, i) => i !== idx))}
            />
          </View>
        ))
      )}
      <AddRowButton
        label="Add material"
        testID="btn-edit-materials-add"
        onPress={() => onChange([...value, blankMaterial()])}
      />
    </View>
  );
}
