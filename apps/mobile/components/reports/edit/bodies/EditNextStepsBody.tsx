/**
 * EditNextStepsBody — list of plain string next-step lines.
 */
import { Text, TextInput, View } from 'react-native';

import {
  AddRowButton,
  Field,
  MULTILINE_CLASS,
  RemoveRowButton,
  ROW_CLASS,
} from './fields';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

export function EditNextStepsBody({ value, onChange }: Props) {
  return (
    <View className="gap-3">
      {value.length === 0 ? (
        <Text className="text-sm text-muted-foreground opacity-60">
          No next steps yet
        </Text>
      ) : (
        value.map((step, idx) => (
          <View
            key={`step-${idx}`}
            className={ROW_CLASS}
            testID={`edit-next-step-row-${idx}`}
          >
            <Field label={`Step ${idx + 1}`}>
              <TextInput
                className={MULTILINE_CLASS}
                value={step}
                onChangeText={(v) => {
                  const next = value.slice();
                  next[idx] = v;
                  onChange(next);
                }}
                multiline
                accessibilityLabel={`Next step ${idx + 1}`}
              />
            </Field>
            <RemoveRowButton
              label={`Remove next step ${idx + 1}`}
              onPress={() => onChange(value.filter((_, i) => i !== idx))}
            />
          </View>
        ))
      )}
      <AddRowButton
        label="Add next step"
        onPress={() => onChange([...value, ''])}
      />
    </View>
  );
}
