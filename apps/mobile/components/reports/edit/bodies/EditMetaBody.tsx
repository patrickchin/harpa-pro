/**
 * EditMetaBody — title + visit date + summary. Surfaced from the
 * SummaryLead card pencil per the design spec ("Summary & meta").
 */
import { TextInput, View } from 'react-native';
import { reports } from '@harpa/api-contract';

import { dateInputValue, isoDateFromInput } from '@/lib/reports/report-body';
import { Field, INPUT_CLASS, MULTILINE_CLASS, nullableString, nullify } from './fields';

interface Props {
  value: reports.ReportBody['meta'];
  onChange: (next: reports.ReportBody['meta']) => void;
}

export function EditMetaBody({ value, onChange }: Props) {
  return (
    <View className="gap-3">
      <Field label="Title">
        <TextInput
          className={INPUT_CLASS}
          value={nullableString(value.title)}
          onChangeText={(v) => onChange({ ...value, title: nullify(v) })}
          accessibilityLabel="Report title"
          testID="input-edit-meta-title"
        />
      </Field>
      <Field label="Visit date">
        <TextInput
          className={INPUT_CLASS}
          value={dateInputValue(value.visitDate)}
          onChangeText={(v) => onChange({ ...value, visitDate: isoDateFromInput(v) })}
          placeholder="YYYY-MM-DD"
          accessibilityLabel="Visit date"
          testID="input-edit-meta-visit-date"
        />
      </Field>
      <Field label="Summary">
        <TextInput
          className={MULTILINE_CLASS}
          value={nullableString(value.summary)}
          onChangeText={(v) => onChange({ ...value, summary: nullify(v) })}
          multiline
          accessibilityLabel="Report summary"
          testID="input-edit-meta-summary"
        />
      </Field>
    </View>
  );
}
