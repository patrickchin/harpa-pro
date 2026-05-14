import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const htmlTemplate = readFileSync(join(here, 'waitlist-confirmation.html'), 'utf8');
const textTemplate = readFileSync(join(here, 'waitlist-confirmation.txt'), 'utf8');

export interface RenderedEmail {
  html: string;
  text: string;
}

export interface WaitlistConfirmationProps {
  confirmUrl: string;
}

export function renderWaitlistConfirmationEmail(
  props: WaitlistConfirmationProps,
): RenderedEmail {
  const { confirmUrl } = props;
  const year = String(new Date().getFullYear());

  const html = htmlTemplate
    .replaceAll('{{confirmUrl}}', confirmUrl)
    .replaceAll('{{year}}', year);

  const text = textTemplate
    .replaceAll('{{confirmUrl}}', confirmUrl);

  return { html, text };
}
