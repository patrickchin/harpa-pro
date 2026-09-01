/**
 * EditWeatherBody — condition, temperature, wind, impact.
 */
import { TextInput, View } from 'react-native';
import { reports } from '@harpa/api-contract';

import { Field, INPUT_CLASS, MULTILINE_CLASS, nullableString, nullify } from './fields';

interface Props {
  value: NonNullable<reports.ReportBody['weather']>;
  onChange: (next: NonNullable<reports.ReportBody['weather']>) => void;
}

export function EditWeatherBody({ value, onChange }: Props) {
  return (
    <View className="gap-3">
      <Field label="Conditions">
        <TextInput
          className={INPUT_CLASS}
          value={nullableString(value.condition)}
          onChangeText={(v) => onChange({ ...value, condition: nullify(v) })}
          accessibilityLabel="Weather conditions"
          testID="input-edit-weather-conditions"
        />
      </Field>
      <Field label="Temperature">
        <TextInput
          className={INPUT_CLASS}
          value={nullableString(value.temperature)}
          onChangeText={(v) => onChange({ ...value, temperature: nullify(v) })}
          accessibilityLabel="Weather temperature"
          testID="input-edit-weather-temperature"
        />
      </Field>
      <Field label="Wind">
        <TextInput
          className={INPUT_CLASS}
          value={nullableString(value.wind)}
          onChangeText={(v) => onChange({ ...value, wind: nullify(v) })}
          accessibilityLabel="Weather wind"
          testID="input-edit-weather-wind"
        />
      </Field>
      <Field label="Impact">
        <TextInput
          className={MULTILINE_CLASS}
          value={nullableString(value.impact)}
          onChangeText={(v) => onChange({ ...value, impact: nullify(v) })}
          multiline
          accessibilityLabel="Weather impact"
          testID="input-edit-weather-impact"
        />
      </Field>
    </View>
  );
}
