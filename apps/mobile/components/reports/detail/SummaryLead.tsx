import { Text } from 'react-native';

interface SummaryLeadProps {
  summary: string | null | undefined;
}

export function SummaryLead({ summary }: SummaryLeadProps) {
  const trimmed = summary?.trim();
  if (!trimmed) return null;

  return (
    <Text className="text-base italic leading-relaxed text-muted-foreground">
      {trimmed}
    </Text>
  );
}
