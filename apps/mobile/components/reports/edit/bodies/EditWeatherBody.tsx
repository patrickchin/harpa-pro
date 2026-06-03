/**
 * EditWeatherBody — conditions, temperature, wind, impact.
 */
import { TextInput, View } from 'react-native';
import type { GeneratedReportWeather } from '@harpa/report-core';

import { Field, INPUT_CLASS, MULTILINE_CLASS, nullableString, nullify } from './fields';

interface Props {
  value: GeneratedReportWeather;
  onChange: (next: GeneratedReportWeather) => void;
}

export function EditWeatherBody({ value, onChange }: Props) {
  return (
    <View className="gap-3">
      <Field label="Conditions">
        <TextInput
          className={INPUT_CLASS}
          value={nullableString(value.conditions)}
          onChangeText={(v) => onChange({ ...value, conditions: nullify(v) })}
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
