/**
 * ReportTabPane — placeholder. Real content (CompletenessCard, the
 * read-only ReportView, ReportPhotos) lands in P3.7. The pane is
 * mounted in the horizontal pager so the layout reserves space and
 * the tab bar can navigate to it without conditionals.
 */
import { View } from 'react-native';

interface ReportTabPaneProps {
  width: number;
}

export function ReportTabPane({ width }: ReportTabPaneProps) {
  // TODO(P3.7): render CompletenessCard + ReportView + ReportPhotos
  // pulling state from useGenerateReport() (generation, draft, notes).
  return <View style={{ width }} className="flex-1" testID="report-tab-pane" />;
}
