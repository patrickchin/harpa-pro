/**
 * Lookup table mapping LLM-emitted section titles to a Lucide icon for
 * the matching SummarySectionCard. Ported verbatim from
 * `../haru3-reports/apps/mobile/lib/section-icons.ts` on branch `dev`.
 */
import {
  Cloud,
  Users,
  TrendingUp,
  AlertTriangle,
  ClipboardList,
  Eye,
  HardHat,
  type LucideIcon,
} from 'lucide-react-native';

export const SECTION_ICONS: Record<string, LucideIcon> = {
  Weather: Cloud,
  Manpower: Users,
  'Work Progress': TrendingUp,
  Progress: TrendingUp,
  'Site Conditions': HardHat,
  Observations: Eye,
  Issues: AlertTriangle,
  'Next Steps': ClipboardList,
};
