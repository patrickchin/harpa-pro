/**
 * Input primitive. Ported from
 * `../haru3-reports/apps/mobile/components/ui/Input.tsx` on branch
 * `dev` — the canonical port source.
 *
 * Pitfall reference: v3 fix `haru3-reports@1ec0fc8`
 * ("center text vertically in Input"). The inline style block
 * (`textAlignVertical: 'center'`, `paddingTop: 0`, `paddingBottom: 0`)
 * is what makes the caret + text sit centred against the touch-target
 * height; do NOT remove or merge into NativeWind classes without
 * regression-testing across iOS / Android.
 */
import { TextInput, View, Text, type TextInputProps } from 'react-native';
import { cn } from '@/lib/utils';
import { getSurfaceDepthStyle } from '@/lib/surface-depth';
import { colors } from '@/lib/design-tokens/colors';

export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  className?: string;
  containerClassName?: string;
}

export function Input({
  label,
  hint,
  error,
  className,
  containerClassName,
  editable = true,
  style,
  ...props
}: InputProps) {
  const isReadOnly = editable === false;

  return (
    <View className={cn('gap-2', containerClassName)}>
      {label ? <Text className="text-label text-muted-foreground">{label}</Text> : null}
      <TextInput
        className={cn(
          'min-h-touch rounded-md border px-4 py-3 text-base text-foreground',
          isReadOnly
            ? 'border-border bg-surface-muted text-muted-foreground'
            : 'border-border bg-card',
          error ? 'border-danger-border' : '',
          className,
        )}
        style={[
          getSurfaceDepthStyle(isReadOnly ? 'flat' : 'raised'),
          // Pitfall v3 `1ec0fc8`: center caret + text against
          // min-h-touch; do not delete.
          { textAlignVertical: 'center', paddingTop: 0, paddingBottom: 0 },
          style,
        ]}
        placeholderTextColor={colors.muted.foreground}
        editable={editable}
        {...props}
      />
      {error ? (
        <Text className="text-sm text-danger-text">{error}</Text>
      ) : hint ? (
        <Text className="text-sm text-muted-foreground">{hint}</Text>
      ) : null}
    </View>
  );
}
