import { View, Text, Pressable } from "react-native";
import { FileText } from "lucide-react-native";
import { Card } from "../primitives/Card";
import { colors } from "../tokens/colors";

export type ReportListRowStatus = "draft" | "final" | string;

export interface ReportListRowProps {
  status: ReportListRowStatus;
  title: string;
  meta: string;
  onPress?: () => void;
  testID?: string;
}

/**
 * Presentational row for the reports list. Renders an icon tile, the
 * report title (with a "Draft" pill when applicable), and a meta line.
 */
export function ReportListRow({
  status,
  title,
  meta,
  onPress,
  testID,
}: ReportListRowProps) {
  const isDraft = status === "draft";
  return (
    <View className="px-5 pt-3">
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
      >
        <Card
          variant={isDraft ? "emphasis" : "default"}
          padding="sm"
          className="flex-row items-center gap-3"
        >
          <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
            <FileText size={20} color={colors.muted.foreground} />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <View className="min-w-0 flex-row items-start gap-2">
              <Text
                className="flex-1 text-lg font-semibold text-foreground"
                numberOfLines={2}
              >
                {title}
              </Text>
              {isDraft && (
                <View className="mt-0.5 shrink-0 rounded-md border border-warning-border bg-warning-soft px-2 py-1">
                  <Text className="text-xs font-semibold uppercase text-warning-text">
                    Draft
                  </Text>
                </View>
              )}
            </View>
            <Text className="text-sm text-muted-foreground">{meta}</Text>
          </View>
        </Card>
      </Pressable>
    </View>
  );
}
