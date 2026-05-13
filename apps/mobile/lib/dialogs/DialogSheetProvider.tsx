/**
 * DialogSheetProvider — imperative dialog API wrapping AppDialogSheet.
 *
 * Mounts a single <AppDialogSheet> at root, controlled by module-level
 * state. Screens call `useAppDialogSheet()` to get an imperative API:
 *   - confirm(opts) → Promise<boolean> (true on confirm, false on cancel/dismiss)
 *   - alert(opts) → Promise<void> (resolves on dismiss)
 *
 * Security review §1 P1: alert() MUST resolve void (not boolean),
 * regardless of action count. Single-button alerts resolve void on
 * dismiss; confirm dialogs resolve boolean.
 */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { AppDialogSheet, type AppDialogSheetProps, type AppDialogAction } from '@/components/primitives/AppDialogSheet';

type DialogKind = 'alert' | 'confirm';

interface DialogState {
  kind: DialogKind;
  title: string;
  message?: string;
  actions: AppDialogAction[];
  resolve: (value: boolean | void) => void;
}

interface DialogContextValue {
  showDialog: (kind: DialogKind, state: Omit<DialogState, 'resolve' | 'kind'>) => Promise<boolean | void>;
  closeDialog: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

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

export function DialogSheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);

  const showDialog = (kind: DialogKind, input: Omit<DialogState, 'resolve' | 'kind'>): Promise<boolean | void> => {
    return new Promise((resolve) => {
      setState({ kind, ...input, resolve: resolve as (value: boolean | void) => void });
    });
  };

  const closeDialog = () => {
    if (!state) return;
    // Close resolves based on kind: confirm → false, alert → void
    state.resolve(state.kind === 'confirm' ? false : undefined);
    setState(null);
  };

  const handleAction = (idx: number) => {
    if (!state) return;
    const action = state.actions[idx];
    if (action) {
      action.onPress();
    }
    // Resolve based on kind and action index:
    //   - confirm: first action (idx 0) → true, others → false
    //   - alert: always void
    if (state.kind === 'confirm') {
      state.resolve(idx === 0);
    } else {
      state.resolve(undefined);
    }
    setState(null);
  };

  return (
    <DialogContext.Provider value={{ showDialog, closeDialog }}>
      {children}
      {state && (
        <AppDialogSheet
          visible={true}
          onClose={closeDialog}
          title={state.title}
          message={state.message}
          actions={state.actions.map((a, i) => ({
            ...a,
            onPress: () => handleAction(i),
          }))}
        />
      )}
    </DialogContext.Provider>
  );
}

export function useAppDialogSheet(): AppDialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useAppDialogSheet must be inside DialogSheetProvider');

  return {
    async confirm(opts: AppDialogOptions): Promise<boolean> {
      return (await ctx.showDialog('confirm', {
        title: opts.title,
        message: opts.message,
        actions: [
          { label: opts.confirmLabel ?? 'Confirm', onPress: () => {} },
          { label: opts.cancelLabel ?? 'Cancel', onPress: () => {} },
        ],
      })) as boolean;
    },
    async alert(opts: AppDialogOptions): Promise<void> {
      await ctx.showDialog('alert', {
        title: opts.title,
        message: opts.message,
        actions: [{ label: 'OK', onPress: () => {} }],
      });
    },
  };
}
