/**
 * Phone-number input with a country-prefix picker.
 *
 * Composed of:
 *   1. A pressable country chip (flag + dial code) that opens
 *      `CountryPickerModal` on tap.
 *   2. A numeric TextInput for the national portion of the number.
 *
 * Parent owns both pieces of state (`country` + `national`) and
 * derives the canonical E.164 string via `combineCountryAndNational`
 * from `lib/phone.ts`. Matches the look-and-feel of the existing
 * `Input` primitive — same min-h-touch, border tokens, surface depth,
 * and label/hint/error slots.
 */
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { ChevronDown, X } from 'lucide-react-native';

import { CountryPickerModal } from '@/components/CountryPickerModal';
import { type Country } from '@/lib/phone/countries';
import { colors } from '@/lib/design-tokens/colors';
import { getSurfaceDepthStyle } from '@/lib/surface-depth';
import { cn } from '@/lib/util/utils';

export interface PhoneNumberInputProps {
  country: Country;
  national: string;
  onChangeCountry: (country: Country) => void;
  onChangeNational: (national: string) => void;
  label?: string;
  hint?: string;
  error?: string | null;
  editable?: boolean;
  autoFocus?: boolean;
  testID?: string;
  countryButtonTestID?: string;
  /**
   * Called when the user taps the inline clear (X) button. Defaults to
   * `onChangeNational('')` when omitted. Provide a custom handler to
   * clear additional state (e.g. a remembered phone number).
   */
  onClear?: () => void;
  clearButtonTestID?: string;
}

export function PhoneNumberInput({
  country,
  national,
  onChangeCountry,
  onChangeNational,
  label = 'Phone Number',
  hint,
  error,
  editable = true,
  autoFocus,
  testID = 'input-phone',
  countryButtonTestID = 'btn-country-picker',
  onClear,
  clearButtonTestID = 'btn-phone-clear',
}: PhoneNumberInputProps) {
  const [pickerVisible, setPickerVisible] = useState(false);
  const isReadOnly = !editable;
  const showClear = !isReadOnly && national.length > 0;
  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      onChangeNational('');
    }
  };

  return (
    <View className="gap-2">
      {label ? <Text className="text-label text-muted-foreground">{label}</Text> : null}

      <View className="flex-row gap-2">
        <Pressable
          onPress={() => {
            if (!isReadOnly) {
              setPickerVisible(true);
            }
          }}
          disabled={isReadOnly}
          testID={countryButtonTestID}
          accessibilityRole="button"
          accessibilityLabel={`Country: ${country.name}, ${country.dialCode}. Tap to change.`}
          className={cn(
            'min-h-touch flex-row items-center gap-2 rounded-md border px-3',
            isReadOnly
              ? 'border-border bg-surface-muted'
              : 'border-border bg-card active:opacity-85',
            error ? 'border-danger-border' : '',
          )}
          style={getSurfaceDepthStyle(isReadOnly ? 'flat' : 'raised')}
        >
          <Text className="text-base text-foreground">{country.dialCode}</Text>
          <ChevronDown size={16} color={colors.muted.foreground} />
        </Pressable>

        <View
          className={cn(
            'min-h-touch flex-1 flex-row items-center rounded-md border',
            isReadOnly ? 'border-border bg-surface-muted' : 'border-border bg-card',
            error ? 'border-danger-border' : '',
          )}
          style={getSurfaceDepthStyle(isReadOnly ? 'flat' : 'raised')}
        >
          <TextInput
            testID={testID}
            value={national}
            onChangeText={onChangeNational}
            placeholder="Phone number"
            placeholderTextColor={colors.muted.foreground}
            keyboardType="phone-pad"
            autoComplete="tel"
            editable={editable}
            autoFocus={autoFocus}
            className={cn(
              'flex-1 px-4 py-3 text-base text-foreground',
              isReadOnly ? 'text-muted-foreground' : '',
            )}
            style={{ textAlignVertical: 'center', lineHeight: 16 }}
          />
          {showClear ? (
            <Pressable
              testID={clearButtonTestID}
              accessibilityRole="button"
              accessibilityLabel="Clear phone number"
              onPress={handleClear}
              className="items-center justify-center px-3 py-3 active:opacity-60"
              hitSlop={8}
            >
              <X size={18} color={colors.muted.foreground} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {error ? (
        <Text className="text-sm text-danger-text">{error}</Text>
      ) : hint ? (
        <Text className="text-sm text-muted-foreground">{hint}</Text>
      ) : null}

      <CountryPickerModal
        visible={pickerVisible}
        selectedCode={country.code}
        onSelect={(next) => {
          onChangeCountry(next);
          setPickerVisible(false);
        }}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
}
