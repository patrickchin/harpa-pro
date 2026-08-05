import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

export interface Rendered {
  container: HTMLDivElement;
  root: Root;
  cleanup: () => Promise<void>;
}

export async function render(ui: ReactNode): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(ui);
  });

  return {
    container,
    root,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export async function waitMs(milliseconds: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  });
}

export async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

export async function change(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): Promise<void> {
  await act(async () => {
    const prototype =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export async function keydown(
  target: Element | Document,
  key: string,
  modifiers: Pick<KeyboardEventInit, 'ctrlKey' | 'metaKey'> = {},
): Promise<void> {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key,
        ...modifiers,
      }),
    );
  });
}

export function button(container: ParentNode, name: string): HTMLButtonElement {
  const match = [...container.querySelectorAll('button')].find(
    (candidate) =>
      candidate.textContent?.trim() === name || candidate.getAttribute('aria-label') === name,
  );
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${name}`);
  }
  return match;
}

export function field(
  container: ParentNode,
  label: string,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const labels = [...container.querySelectorAll('label')];
  const match = labels.find((candidate) => candidate.textContent?.trim().startsWith(label));
  const id = match?.htmlFor;
  const byId = id ? match?.ownerDocument.getElementById(id) : null;
  const control =
    byId && container.contains(byId) ? byId : match?.querySelector('input, textarea, select');
  if (
    !(control instanceof HTMLInputElement) &&
    !(control instanceof HTMLTextAreaElement) &&
    !(control instanceof HTMLSelectElement)
  ) {
    throw new Error(`Field not found: ${label}`);
  }
  return control;
}
