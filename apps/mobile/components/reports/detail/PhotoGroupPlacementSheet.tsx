/**
 * PhotoGroupPlacementSheet — bottom-sheet dialog that lets the user
 * pick where a photo group should appear inside the generated report.
 *
 * Listing strategy:
 *  - Top group: "Issues" — one row per `report.issues[i]` with the
 *    issue title + severity hint.
 *  - Bottom group: "Sections" — one row per `report.sections[i]` with
 *    the section title.
 *  - "Remove placement" footer row appears only when the group has a
 *    current placement, and writes `target: null`.
 *
 * The sheet itself owns no state: it receives the current placement
 * and a single `onSelect(placement | null)` callback that the caller
 * wires to the report attachment placement mutation. Closing without a tap is a
 * no-op (per AppDialogSheet conventions).
 *
 * No `Alert.alert`: the sheet IS the dialog (Pitfall 12).
 */
import { ScrollView, Text, View, Pressable } from 'react-native';
import { AlertTriangle, ClipboardList, MapPinOff } from 'lucide-react-native';
import type {
  GeneratedReportIssue,
  GeneratedReportSection,
} from '@harpa/report-core';

import { AppDialogSheet } from '@/components/primitives/AppDialogSheet';
import { colors } from '@/lib/design-tokens/colors';

export type PhotoPlacement =
  | { kind: 'issue'; index: number }
  | { kind: 'section'; index: number };

export interface PhotoGroupPlacementSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Photos in the group (used only for the title's "(N photos)" hint). */
  photoCount: number;
  /** Read from the live report so the list always matches what's on screen. */
  issues: readonly GeneratedReportIssue[];
  sections: readonly GeneratedReportSection[];
  /** Currently-stored placement on the parent note. Null = unplaced. */
  current: PhotoPlacement | null;
  /**
   * Pass `null` to clear placement; otherwise the chosen target. Caller
   * is responsible for closing the sheet (typically inside `onSelect`).
   */
  onSelect: (placement: PhotoPlacement | null) => void;
  testID?: string;
}

export function PhotoGroupPlacementSheet({
  visible,
  onClose,
  photoCount,
  issues,
  sections,
  current,
  onSelect,
  testID,
}: PhotoGroupPlacementSheetProps) {
  const noTargets = issues.length === 0 && sections.length === 0;
  const titleSuffix = photoCount > 1 ? ` (${photoCount} photos)` : '';

  return (
    <AppDialogSheet
      visible={visible}
      title={`Place photos${titleSuffix}`}
      onClose={onClose}
      // The sheet's own buttons would be redundant here — the row list
      // IS the action surface. Provide just a Cancel/Done so the
      // primitive's bottom action area doesn't render empty.
      actions={[
        {
          label: 'Cancel',
          onPress: onClose,
          variant: 'quiet',
          testID: 'btn-photo-placement-cancel',
        },
      ]}
    >
      <View testID={testID ?? 'placement-sheet'}>
        {noTargets ? (
          <Text className="px-1 py-3 text-sm text-muted-foreground">
            This report has no issues or sections yet. Generate the
            report first, then come back to place photos.
          </Text>
        ) : (
          <ScrollView
            className="max-h-96"
            // 384pt cap (max-h-96 in NativeWind) keeps the sheet from
            // growing to fill the screen on long reports while letting
            // the user scroll through every target.
          >
            {issues.length > 0 && (
              <Section title="Issues">
                {issues.map((issue, i) => (
                  <Row
                    key={`issue-${i}`}
                    icon={
                      <AlertTriangle
                        size={16}
                        color={colors.warning.text}
                      />
                    }
                    title={issue.title}
                    subtitle={issue.severity}
                    selected={
                      current?.kind === 'issue' && current.index === i
                    }
                    onPress={() => onSelect({ kind: 'issue', index: i })}
                    testID={`placement-sheet-issue-${i}`}
                  />
                ))}
              </Section>
            )}

            {sections.length > 0 && (
              <Section title="Sections">
                {sections.map((section, i) => (
                  <Row
                    key={`section-${i}`}
                    icon={
                      <ClipboardList
                        size={16}
                        color={colors.foreground}
                      />
                    }
                    title={section.title}
                    selected={
                      current?.kind === 'section' && current.index === i
                    }
                    onPress={() => onSelect({ kind: 'section', index: i })}
                    testID={`placement-sheet-section-${i}`}
                  />
                ))}
              </Section>
            )}
          </ScrollView>
        )}

        {current !== null && (
          <Pressable
            onPress={() => onSelect(null)}
            className="mt-3 flex-row items-center gap-2 rounded-md border border-border px-3 py-2.5"
            accessibilityRole="button"
            accessibilityLabel="Remove placement"
            testID="placement-sheet-remove"
          >
            <MapPinOff size={16} color={colors.muted.foreground} />
            <Text className="text-sm font-medium text-muted-foreground">
              Remove placement
            </Text>
          </Pressable>
        )}
      </View>
    </AppDialogSheet>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-3">
      <Text className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </Text>
      <View className="gap-1">{children}</View>
    </View>
  );
}

function Row({
  icon,
  title,
  subtitle,
  selected,
  onPress,
  testID,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center gap-2.5 rounded-md border px-3 py-2.5 ${
        selected
          ? 'border-primary/40 bg-primary/10'
          : 'border-border bg-background'
      }`}
    >
      {icon}
      <View className="min-w-0 flex-1">
        <Text
          className={`text-base font-medium ${
            selected ? 'text-primary' : 'text-foreground'
          }`}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
