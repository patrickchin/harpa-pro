/**
 * Shared field primitives for the per-kind edit-modal bodies. Keeping them
 * local gives every report section the same input treatment.
 */
import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Plus, Trash2 } from 'lucide-react-native';

import { colors } from '@/lib/design-tokens/colors';

export const INPUT_CLASS =
  'rounded-md border border-border bg-card px-3 py-2 text-base text-foreground';
export const MULTILINE_CLASS = `${INPUT_CLASS} min-h-[88px]`;
const LABEL_CLASS = 'text-sm font-medium text-muted-foreground';
const FIELD_CLASS = 'gap-1';
export const ROW_CLASS = 'gap-2 rounded-md border border-border bg-surface-muted p-3';

export function parseNumeric(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function numericString(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export function nullableString(value: string | null | undefined): string {
  return value ?? '';
}

export function nullify(value: string): string | null {
  return value.trim() === '' ? null : value;
}

interface FieldProps {
  label: string;
  children: ReactNode;
}

export function Field({ label, children }: FieldProps) {
  return (
    <View className={FIELD_CLASS}>
      <Text className={LABEL_CLASS}>{label}</Text>
      {children}
    </View>
  );
}

interface AddRowButtonProps {
  label: string;
  onPress: () => void;
  testID?: string;
}

export function AddRowButton({ label, onPress, testID }: AddRowButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      className="mt-1 flex-row items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card px-3 py-2"
      accessibilityLabel={label}
      testID={testID}
    >
      <Plus size={16} color={colors.foreground} />
      <Text className="text-base font-medium text-foreground">{label}</Text>
    </Pressable>
  );
}

interface RemoveRowButtonProps {
  label: string;
  onPress: () => void;
  testID?: string;
}

export function RemoveRowButton({ label, onPress, testID }: RemoveRowButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      className="self-end flex-row items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5"
      accessibilityLabel={label}
      testID={testID}
    >
      <Trash2 size={14} color={colors.muted.foreground} />
      <Text className="text-sm font-medium text-muted-foreground">Remove</Text>
    </Pressable>
  );
}
