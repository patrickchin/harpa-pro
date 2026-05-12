/**
 * useAppDialogSheet — themed in-app dialog (replaces Alert.alert).
 *
 * P0 stub. Real implementation lands with the P2 shared-primitives pack.
 * Reason for existence: Pitfall + AGENTS.md hard rule #9 — no Alert.alert
 * for in-app dialogs. Code that needs a dialog imports this hook so the
 * eventual primitive swap-in is a no-op refactor.
 */
export interface AppDialogOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface AppDialogApi {
  confirm(opts: AppDialogOptions): Promise<boolean>;
  alert(opts: AppDialogOptions): Promise<void>;
}

export function useAppDialogSheet(): AppDialogApi {
  return {
    async confirm(_opts) {
      // Stub: returns true so flows compile during P0; replaced in P2.
      return true;
    },
    async alert(_opts) {
      return;
    },
  };
}
