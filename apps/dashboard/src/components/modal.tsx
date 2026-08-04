import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { Children, isValidElement, type ReactNode, type RefObject } from 'react';

import { cn } from '@/lib/cn';

export interface ModalProps {
  ariaLabelledBy: string;
  ariaDescribedBy?: string;
  backdropClassName?: string;
  children: ReactNode;
  closeOnEscape?: boolean;
  dialogClassName?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  role?: 'alertdialog' | 'dialog';
}

function findDialogLabel(node: ReactNode, labelledBy: string): ReactNode | undefined {
  let label: ReactNode | undefined;

  Children.forEach(node, (child) => {
    if (label !== undefined || !isValidElement<{ children?: ReactNode; id?: string }>(child)) return;
    if (child.props.id === labelledBy) {
      label = child.props.children;
      return;
    }
    label = findDialogLabel(child.props.children, labelledBy);
  });

  return label;
}

export function Modal({
  ariaLabelledBy,
  ariaDescribedBy,
  backdropClassName,
  children,
  closeOnEscape = true,
  dialogClassName,
  initialFocusRef,
  onClose,
  role = 'dialog',
}: ModalProps): React.JSX.Element {
  const accessibleTitle = findDialogLabel(children, ariaLabelledBy);

  return (
    <Dialog
      aria-describedby={ariaDescribedBy}
      className="relative z-50"
      initialFocus={initialFocusRef}
      onClose={closeOnEscape ? onClose : () => undefined}
      open
      role={role}
    >
      {accessibleTitle !== undefined ? (
        <DialogTitle className="sr-only">{accessibleTitle}</DialogTitle>
      ) : null}
      <DialogBackdrop
        className={cn('fixed inset-0 bg-primary/50 backdrop-blur-[1px]', backdropClassName)}
      />
      <div className="fixed inset-0 overflow-y-auto p-4">
        <div className="grid min-h-full place-items-center">
          <DialogPanel
            className={cn(
              'w-full max-w-lg rounded-panel-ui border border-border bg-card p-5 shadow-floating-ui',
              dialogClassName,
            )}
          >
            {children}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
