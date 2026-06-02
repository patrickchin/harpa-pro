/**
 * EditMetaBody — title + visit date + summary. Surfaced from the
 * SummaryLead card pencil per the design spec ("Summary & meta").
 */
import { TextInput, View } from 'react-native';

import type { GeneratedReportMeta } from '@/lib/reports/report-edit-helpers';
import { Field, INPUT_CLASS, MULTILINE_CLASS, nullableString, nullify } from './fields';

interface Props {
  value: GeneratedReportMeta;
  onChange: (next: GeneratedReportMeta) => void;
}

export function EditMetaBody({ value, onChange }: Props) {
  return (
    <View className="gap-3">
      <Field label="Title">
        <TextInput
          className={INPUT_CLASS}
          value={value.title}
          onChangeText={(v) => onChange({ ...value, title: v })}
          accessibilityLabel="Report title"
        />
      </Field>
      <Field label="Visit date">
        <TextInput
          className={INPUT_CLASS}
          value={nullableString(value.visitDate)}
          onChangeText={(v) => onChange({ ...value, visitDate: nullify(v) })}
          placeholder="YYYY-MM-DD"
          accessibilityLabel="Visit date"
        />
      </Field>
      <Field label="Summary">
        <TextInput
          className={MULTILINE_CLASS}
          value={value.summary}
          onChangeText={(v) => onChange({ ...value, summary: v })}
          multiline
          accessibilityLabel="Report summary"
        />
      </Field>
    </View>
  );
}
