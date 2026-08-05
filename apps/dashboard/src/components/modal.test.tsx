import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from './modal';

function ModalHarness({
  closeOnEscape = true,
  onClose = () => undefined,
}: {
  closeOnEscape?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const initialFocusRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {open ? (
        <Modal
          ariaLabelledBy="test-dialog-title"
          closeOnEscape={closeOnEscape}
          initialFocusRef={initialFocusRef}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <h2 id="test-dialog-title">Test dialog</h2>
          <input aria-label="First field" ref={initialFocusRef} />
          <button type="button">Last action</button>
        </Modal>
      ) : null}
    </>
  );
}

describe('Modal', () => {
  it('moves focus into the dialog and traps forward and backward Tab', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole('button', { name: 'Open dialog' }));

    const firstField = screen.getByRole('textbox', { name: 'First field' });
    const lastAction = screen.getByRole('button', { name: 'Last action' });
    expect(firstField).toHaveFocus();

    lastAction.focus();
    await user.tab();
    expect(firstField).toHaveFocus();

    await user.tab({ shift: true });
    expect(lastAction).toHaveFocus();
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} />);

    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('does not close on Escape while dismissal is unsafe', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ModalHarness closeOnEscape={false} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    await user.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Test dialog' })).toBeVisible();
  });
});
