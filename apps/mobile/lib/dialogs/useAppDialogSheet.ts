/**
 * useAppDialogSheet — themed in-app dialog (replaces Alert.alert).
 *
 * Real implementation is now in DialogSheetProvider.tsx (P2.6). This
 * file re-exports the types and hook for convenience.
 */
export type { AppDialogOptions, AppDialogApi } from './DialogSheetProvider';
export { useAppDialogSheet } from './DialogSheetProvider';
