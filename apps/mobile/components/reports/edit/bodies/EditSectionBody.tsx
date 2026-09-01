/**
 * EditSectionBody — single detailed section (heading + body content).
 * Per-item.
 */
import { TextInput, View } from 'react-native';
import { reports } from '@harpa/api-contract';

import { Field, INPUT_CLASS, MULTILINE_CLASS } from './fields';

interface Props {
  value: reports.ReportBody['summarySections'][number];
  onChange: (next: reports.ReportBody['summarySections'][number]) => void;
}

export function EditSectionBody({ value, onChange }: Props) {
  return (
    <View className="gap-3">
      <Field label="Heading">
        <TextInput
          className={INPUT_CLASS}
          value={value.title}
          onChangeText={(v) => onChange({ ...value, title: v })}
          accessibilityLabel="Section heading"
          testID="input-edit-section-heading"
        />
      </Field>
      <Field label="Body">
        <TextInput
          className={MULTILINE_CLASS}
          value={value.body}
          onChangeText={(v) => onChange({ ...value, body: v })}
          multiline
          accessibilityLabel="Section body"
          testID="input-edit-section-body"
        />
      </Field>
    </View>
  );
}
