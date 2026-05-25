/**
 * Country picker modal — used by `PhoneNumberInput` so users can pick
 * the country dial-code prefix without typing "+ ... " by hand.
 *
 * Built on RN's `Modal` (NOT `Alert.alert`, per AGENTS.md hard rule 4).
 * Renders full-screen with safe-area padding so the search input stays
 * pinned to the top regardless of keyboard height — previously the
 * bottom-sheet variant (`justify-end` + `maxHeight: '85%'`) let the
 * keyboard cover the search field on shorter devices.
 *
 * Includes an in-modal search box that filters by country name or
 * dial code, and a flat list of all 245 ISO 3166-1 countries from
 * `lib/countries.ts`.
 */
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { X, Search, Check } from 'lucide-react-native';

import { SafeAreaView } from '@/components/primitives/SafeAreaView';
import { COUNTRIES, type Country } from '@/lib/countries';
import { colors } from '@/lib/design-tokens/colors';
import { getSurfaceDepthStyle } from '@/lib/surface-depth';

export interface CountryPickerModalProps {
  visible: boolean;
  selectedCode: string;
  onSelect: (country: Country) => void;
  onClose: () => void;
}

function matches(country: Country, query: string): boolean {
  if (!query) return true;
  const normalized = query.toLowerCase().replace(/^\+/, '');
  return (
    country.name.toLowerCase().includes(normalized) ||
    country.code.toLowerCase().includes(normalized) ||
    country.dialCode.replace(/^\+/, '').startsWith(normalized) ||
    country.aliases.some((alias) => alias.toLowerCase().includes(normalized))
  );
}

export function CountryPickerModal({
  visible,
  selectedCode,
  onSelect,
  onClose,
}: CountryPickerModalProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => COUNTRIES.filter((country) => matches(country, query)),
    [query],
  );

  if (!visible) {
    return null;
  }

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle="fullScreen"
    >
      <SafeAreaView className="flex-1 bg-background" testID="country-picker-sheet">
        <View className="flex-row items-center justify-between border-b border-border px-5 py-4">
          <Text className="text-xl font-bold text-foreground">
            Select country
          </Text>
          <Pressable
            onPress={handleClose}
            hitSlop={12}
            testID="country-picker-close"
            accessibilityLabel="Close country picker"
          >
            <X size={20} color={colors.muted.foreground} />
          </Pressable>
        </View>

        <View className="px-5 pt-4">
          <View
            className="min-h-touch flex-row items-center gap-2 rounded-md border border-border bg-card px-3"
            style={getSurfaceDepthStyle('raised')}
          >
            <Search size={18} color={colors.muted.foreground} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search country or code"
              placeholderTextColor={colors.muted.foreground}
              autoCorrect={false}
              autoCapitalize="none"
              className="flex-1 py-3 text-base text-foreground"
              style={{ textAlignVertical: 'center', lineHeight: 16 }}
              testID="country-picker-search"
            />
          </View>
        </View>

        <FlatList
          className="mt-2"
          data={filtered}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={20}
          ListEmptyComponent={
            <View className="px-5 py-8">
              <Text className="text-center text-sm text-muted-foreground">
                No countries match "{query}".
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isSelected = item.code === selectedCode;
            return (
              <Pressable
                onPress={() => {
                  setQuery('');
                  onSelect(item);
                }}
                className="min-h-touch flex-row items-center gap-3 border-b border-border px-5 py-3 active:bg-surface-muted"
                testID={`country-option-${item.code}`}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.dialCode}`}
              >
                <Text className="text-2xl">{item.flag}</Text>
                <Text className="flex-1 text-base text-foreground">
                  {item.name}
                </Text>
                <Text className="text-base text-muted-foreground">
                  {item.dialCode}
                </Text>
                {isSelected ? (
                  <Check size={18} color={colors.accent.DEFAULT} />
                ) : (
                  <View style={{ width: 18 }} />
                )}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}
