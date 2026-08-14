/**
 * EditIssueBody — single issue's fields. Per-item (each issue card
 * row gets its own pencil).
 */
import { TextInput, View } from 'react-native';
import { reports } from '@harpa/api-contract';

import { Field, INPUT_CLASS, MULTILINE_CLASS, nullableString, nullify } from './fields';

interface Props {
  value: reports.ReportBody['issues'][number];
  onChange: (next: reports.ReportBody['issues'][number]) => void;
}

export function EditIssueBody({ value, onChange }: Props) {
  return (
    <View className="gap-3">
      <Field label="Title">
        <TextInput
          className={INPUT_CLASS}
          value={value.title}
          onChangeText={(v) => onChange({ ...value, title: v })}
          accessibilityLabel="Issue title"
          testID="input-edit-issue-title"
        />
      </Field>
      <Field label="Severity (low/medium/high)">
        <TextInput
          className={INPUT_CLASS}
          value={nullableString(value.severity)}
          onChangeText={(v) => onChange({ ...value, severity: nullify(v) })}
          accessibilityLabel="Issue severity"
          testID="input-edit-issue-severity"
        />
      </Field>
      <Field label="Details">
        <TextInput
          className={MULTILINE_CLASS}
          value={nullableString(value.description)}
          onChangeText={(v) => onChange({ ...value, description: nullify(v) })}
          multiline
          accessibilityLabel="Issue details"
          testID="input-edit-issue-details"
        />
      </Field>
      <Field label="Action required">
        <TextInput
          className={INPUT_CLASS}
          value={nullableString(value.action)}
          onChangeText={(v) => onChange({ ...value, action: nullify(v) })}
          accessibilityLabel="Issue action required"
          testID="input-edit-issue-action-required"
        />
      </Field>
    </View>
  );
}
