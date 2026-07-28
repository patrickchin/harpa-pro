import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.closest('[aria-hidden="true"]') &&
      !element.closest('[inert]'),
  );
}

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

export function Modal({
  ariaLabelledBy,
  ariaDescribedBy,
  backdropClassName = 'modal-backdrop',
  children,
  closeOnEscape = true,
  dialogClassName = 'modal',
  initialFocusRef,
  onClose,
  role = 'dialog',
}: ModalProps): React.JSX.Element {
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const restoreFocus = restoreFocusRef.current;

    const initialFocus = initialFocusRef?.current ?? focusableElements(dialog)[0] ?? dialog;
    initialFocus.focus();

    return () => {
      if (restoreFocus?.isConnected) restoreFocus.focus();
    };
  }, [initialFocusRef]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const dialog = dialogRef.current;
      if (!dialog) return;

      if (event.key === 'Escape') {
        if (!closeOnEscape) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = focusableElements(dialog);
      const first = focusable[0] ?? dialog;
      const last = focusable.at(-1) ?? dialog;
      const activeElement = document.activeElement;

      if (!dialog.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEscape, onClose]);

  return (
    <div className={backdropClassName}>
      <section
        aria-describedby={ariaDescribedBy}
        aria-labelledby={ariaLabelledBy}
        aria-modal="true"
        className={dialogClassName}
        ref={dialogRef}
        role={role}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}
