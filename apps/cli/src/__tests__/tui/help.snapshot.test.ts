import { describe, it, expect } from 'vitest';
import { renderUsage } from 'citty';
import { tuiCommand } from '../../tui/index.js';

describe('harpa tui --help snapshot', () => {
  it('matches the frozen help text', async () => {
    const usage = await renderUsage(tuiCommand);
    expect(usage).toMatchInlineSnapshot(`
      "Interactive menu-driven shell for the harpa-pro API. (tui)

      USAGE \`tui \`
      "
    `);
  });
});
