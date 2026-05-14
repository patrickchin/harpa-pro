import {
  Cloud,
  Users,
  TrendingUp,
  AlertTriangle,
  ClipboardList,
  Eye,
  HardHat,
} from "lucide-react-native";

export const SECTION_ICONS: Record<
  string,
  React.ComponentType<{ size: number; color: string }>
> = {
  Weather: Cloud,
  Manpower: Users,
  "Work Progress": TrendingUp,
  Progress: TrendingUp,
  "Site Conditions": HardHat,
  Observations: Eye,
  Issues: AlertTriangle,
  "Next Steps": ClipboardList,
};
