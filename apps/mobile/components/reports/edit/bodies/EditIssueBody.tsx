/**
 * EditIssueBody — single issue's fields. Per-item (each issue card
 * row gets its own pencil).
 */
import { TextInput, View } from 'react-native';
import type { GeneratedReportIssue } from '@harpa/report-core';

import { Field, INPUT_CLASS, MULTILINE_CLASS, nullableString, nullify } from './fields';

interface Props {
  value: GeneratedReportIssue;
  onChange: (next: GeneratedReportIssue) => void;
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
      <Field label="Category">
        <TextInput
          className={INPUT_CLASS}
          value={value.category}
          onChangeText={(v) => onChange({ ...value, category: v })}
          accessibilityLabel="Issue category"
          testID="input-edit-issue-category"
        />
      </Field>
      <Field label="Severity (low/medium/high)">
        <TextInput
          className={INPUT_CLASS}
          value={value.severity}
          onChangeText={(v) => onChange({ ...value, severity: v })}
          accessibilityLabel="Issue severity"
          testID="input-edit-issue-severity"
        />
      </Field>
      <Field label="Status">
        <TextInput
          className={INPUT_CLASS}
          value={value.status}
          onChangeText={(v) => onChange({ ...value, status: v })}
          accessibilityLabel="Issue status"
          testID="input-edit-issue-status"
        />
      </Field>
      <Field label="Details">
        <TextInput
          className={MULTILINE_CLASS}
          value={value.details}
          onChangeText={(v) => onChange({ ...value, details: v })}
          multiline
          accessibilityLabel="Issue details"
          testID="input-edit-issue-details"
        />
      </Field>
      <Field label="Action required">
        <TextInput
          className={INPUT_CLASS}
          value={nullableString(value.actionRequired)}
          onChangeText={(v) => onChange({ ...value, actionRequired: nullify(v) })}
          accessibilityLabel="Issue action required"
          testID="input-edit-issue-action-required"
        />
      </Field>
    </View>
  );
}
