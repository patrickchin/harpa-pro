import { View, Text } from "react-native";
import { ClipboardList } from "lucide-react-native";
import { Card } from "../primitives/Card";
import { SectionHeader } from "../primitives/SectionHeader";
import { colors } from "../tokens/colors";

interface NextStepsCardProps {
  steps: readonly string[];
}

export function NextStepsCard({ steps }: NextStepsCardProps) {
  if (steps.length === 0) return null;

  return (
    <Card variant="default" padding="lg">
      <SectionHeader
        title="Next Steps"
        subtitle={
          steps.length === 1
            ? "1 follow-up action."
            : `${steps.length} follow-up actions.`
        }
        icon={<ClipboardList size={16} color={colors.foreground} />}
      />
      <View className="mt-4 gap-3">
        {steps.map((step, index) => (
          <View key={`step-${index}`} className="flex-row items-start gap-3">
            <Text className="min-w-[18px] text-base font-semibold text-foreground">
              {index + 1}.
            </Text>
            <Text className="flex-1 text-base leading-relaxed text-muted-foreground">
              {step}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
