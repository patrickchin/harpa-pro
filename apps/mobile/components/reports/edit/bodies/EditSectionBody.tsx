/**
 * EditSectionBody — single detailed section (heading + body content).
 * Per-item.
 */
import { TextInput, View } from 'react-native';
import type { GeneratedReportSection } from '@harpa/report-core';

import { Field, INPUT_CLASS, MULTILINE_CLASS } from './fields';

interface Props {
  value: GeneratedReportSection;
  onChange: (next: GeneratedReportSection) => void;
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
          value={value.content}
          onChangeText={(v) => onChange({ ...value, content: v })}
          multiline
          accessibilityLabel="Section body"
          testID="input-edit-section-body"
        />
      </Field>
    </View>
  );
}
