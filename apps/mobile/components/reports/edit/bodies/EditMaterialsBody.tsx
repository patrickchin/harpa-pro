/**
 * EditMaterialsBody — whole materials list (name, quantity, unit,
 * condition, status, notes), with add / remove rows.
 */
import { Text, TextInput, View } from 'react-native';
import type { GeneratedReportMaterial } from '@harpa/report-core';

import { blankMaterial } from '@/lib/reports/report-edit-helpers';

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
  value: GeneratedReportMaterial[];
  onChange: (next: GeneratedReportMaterial[]) => void;
}

export function EditMaterialsBody({ value, onChange }: Props) {
  return (
    <View className="gap-3">
      {value.length === 0 ? (
        <Text className="text-sm text-muted-foreground opacity-60">
          No materials yet
        </Text>
      ) : (
        value.map((mat, idx) => (
          <View
            key={`mat-${idx}`}
            className={ROW_CLASS}
            testID={`edit-material-row-${idx}`}
          >
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
              />
            </Field>
            <Field label="Unit">
              <TextInput
                className={INPUT_CLASS}
                value={nullableString(mat.quantityUnit)}
                onChangeText={(v) => {
                  const next = value.slice();
                  next[idx] = { ...next[idx]!, quantityUnit: nullify(v) };
                  onChange(next);
                }}
                accessibilityLabel={`Material ${idx + 1} unit`}
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
              />
            </Field>
            <RemoveRowButton
              label={`Remove material ${idx + 1}`}
              onPress={() => onChange(value.filter((_, i) => i !== idx))}
            />
          </View>
        ))
      )}
      <AddRowButton
        label="Add material"
        onPress={() => onChange([...value, blankMaterial()])}
      />
    </View>
  );
}
