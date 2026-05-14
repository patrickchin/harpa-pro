/**
 * Human-readable renderers for `@harpa/cli`.
 *
 * Every command's `format` callback delegates here. Renderers are pure
 * `(data) => string` functions so they're trivial to snapshot test —
 * keep them deterministic (no Date.now, no locale-dependent formatting
 * unless explicitly desired).
 *
 * Each renderer has a matching counterpart in `commands/*.ts` that wires
 * it through `runRequest`/`executeRequest`. Adding a new renderer here
 * should always come with a snapshot test in `__tests__/render.test.ts`.
 */
import chalk from 'chalk';

export interface UserLike {
  id: string;
  phone: string;
  displayName: string | null;
  companyName: string | null;
  createdAt: string;
}

export function renderUser(user: UserLike): string {
  const name = user.displayName ?? chalk.dim('(no display name)');
  const company = user.companyName ?? chalk.dim('(no company)');
  return [
    `${chalk.bold(name)} ${chalk.dim(`<${user.phone}>`)}`,
    `  ID:        ${user.id}`,
    `  Company:   ${company}`,
    `  Joined:    ${user.createdAt}`,
  ].join('\n');
}

export interface UsageMonth {
  month: string;
  reports: number;
  voiceNotes: number;
}

export interface UsageLike {
  months: UsageMonth[];
  totals: { reports: number; voiceNotes: number };
}

export function renderUsage(usage: UsageLike): string {
  const header = chalk.bold('Month     Reports  Voice notes');
  const rows = usage.months.map((m) => {
    return `${m.month}   ${pad(m.reports, 7)}  ${pad(m.voiceNotes, 11)}`;
  });
  const totals = `${chalk.dim('Total     ')}${pad(usage.totals.reports, 7)}  ${pad(usage.totals.voiceNotes, 11)}`;
  return [header, ...rows, chalk.dim('—'.repeat(30)), totals].join('\n');
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, ' ');
}
