/**
 * EditTabPane — placeholder. Inline section editors land in P3.8 once
 * `ReportEditForm` and the manual-entry seed path (`createEmptyReport`)
 * are ported.
 */
import { View } from 'react-native';

interface EditTabPaneProps {
  width: number;
}

export function EditTabPane({ width }: EditTabPaneProps) {
  // TODO(P3.8): mount ReportEditForm + autosave status row.
  return <View style={{ width }} className="flex-1" testID="edit-tab-pane" />;
}
