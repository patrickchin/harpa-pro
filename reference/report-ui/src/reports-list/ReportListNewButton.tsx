import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Plus } from "lucide-react-native";
import { colors } from "../tokens/colors";

export interface ReportListNewButtonProps {
  onPress: () => void;
  isLoading?: boolean;
  title?: string;
  description?: string;
  testID?: string;
}

/**
 * "New report" call-to-action that sits at the top of the reports list.
 * Renders a dashed-border tile with a spinner while a draft is being
 * created.
 */
export function ReportListNewButton({
  onPress,
  isLoading = false,
  title = "New report",
  description = "Start a draft for this project.",
  testID,
}: ReportListNewButtonProps) {
  return (
    <View className="px-5 pt-3">
      <Pressable
        testID={testID}
        onPress={() => {
          if (!isLoading) onPress();
        }}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel="Create new report"
      >
        <View
          className="flex-row items-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted p-3"
          style={{ opacity: isLoading ? 0.6 : 1 }}
        >
          <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-card">
            {isLoading ? (
              <ActivityIndicator size={16} color={colors.foreground} />
            ) : (
              <Plus size={20} color={colors.foreground} />
            )}
          </View>
          <View className="flex-1">
            <Text className="text-lg font-semibold text-foreground">
              {title}
            </Text>
            <Text className="text-sm text-muted-foreground">{description}</Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}
