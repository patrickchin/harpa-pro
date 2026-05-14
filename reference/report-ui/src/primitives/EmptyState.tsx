import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Card } from "./Card";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <Card variant="muted" className="items-center py-8">
      {icon ? (
        <View className="mb-4 h-16 w-16 items-center justify-center rounded-lg border border-border bg-card">
          {icon}
        </View>
      ) : null}
      <Text className="text-title-sm text-foreground">{title}</Text>
      <Text className="mt-2 text-center text-body text-muted-foreground">
        {description}
      </Text>
      {action ? <View className="mt-5">{action}</View> : null}
    </Card>
  );
}
