import { View } from "react-native";
import type { GeneratedSiteReport } from "@harpa/report-core";
import { StatTile } from "../primitives/StatTile";
import { getReportStats } from "./report-stats";

interface StatBarProps {
  report: GeneratedSiteReport;
}

export function StatBar({ report }: StatBarProps) {
  const stats = getReportStats(report);

  return (
    <View className="flex-row gap-3">
      {stats.map((stat, i) => (
        <StatTile
          key={stat.label}
          value={stat.value}
          label={stat.label}
          tone={stat.tone === "warning" && i === 2 ? "warning" : "default"}
          compact
        />
      ))}
    </View>
  );
}
