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

export interface ProjectLike {
  id: string;
  name: string;
  clientName: string | null;
  address: string | null;
  ownerId: string;
  myRole: 'owner' | 'editor' | 'viewer';
  createdAt: string;
  updatedAt: string;
  stats?: {
    totalReports: number;
    drafts: number;
    lastReportAt: string | null;
  };
}

export function renderProject(p: ProjectLike): string {
  const lines = [
    `${chalk.bold(p.name)} ${chalk.dim(`(${p.myRole})`)}`,
    `  ID:         ${p.id}`,
    `  Client:     ${p.clientName ?? chalk.dim('(none)')}`,
    `  Address:    ${p.address ?? chalk.dim('(none)')}`,
    `  Owner:      ${p.ownerId}`,
    `  Created:    ${p.createdAt}`,
    `  Updated:    ${p.updatedAt}`,
  ];
  if (p.stats) {
    lines.push(
      `  Reports:    ${p.stats.totalReports} (${p.stats.drafts} drafts)`,
      `  Last report: ${p.stats.lastReportAt ?? chalk.dim('(none)')}`,
    );
  }
  return lines.join('\n');
}

export function renderProjectList(
  page: { items: ProjectLike[]; nextCursor: string | null },
): string {
  if (page.items.length === 0) {
    return chalk.dim('No projects.');
  }
  const rows = page.items.map((p) => {
    const client = p.clientName ?? chalk.dim('—');
    return `  ${chalk.bold(p.name).padEnd(40)}  ${p.myRole.padEnd(6)}  ${client}  ${chalk.dim(p.id)}`;
  });
  const footer = page.nextCursor
    ? chalk.dim(`\nNext page: --cursor ${page.nextCursor}`)
    : chalk.dim('\n(end of list)');
  return [chalk.bold('Projects:'), ...rows, footer].join('\n');
}

export interface ReportLike {
  id: string;
  projectId: string;
  status: 'draft' | 'finalized';
  visitDate: string | null;
  finalizedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  body?: unknown;
}

export function renderReport(r: ReportLike): string {
  const lines = [
    `${chalk.bold(`Report ${r.id}`)} ${chalk.dim(`(${r.status})`)}`,
    `  Project:    ${r.projectId}`,
    `  Visit date: ${r.visitDate ?? chalk.dim('(none)')}`,
    `  Created:    ${r.createdAt}`,
    `  Updated:    ${r.updatedAt}`,
  ];
  if (r.finalizedAt) {
    lines.push(`  Finalized:  ${r.finalizedAt}`);
  }
  if (r.body && typeof r.body === 'object') {
    lines.push(chalk.dim('  Body:       (use --json to see full structured body)'));
  } else {
    lines.push(`  Body:       ${chalk.dim('(empty)')}`);
  }
  return lines.join('\n');
}

export function renderReportList(
  page: { items: ReportLike[]; nextCursor: string | null },
): string {
  if (page.items.length === 0) {
    return chalk.dim('No reports.');
  }
  const rows = page.items.map((r) => {
    const visit = r.visitDate ?? chalk.dim('—');
    return `  ${chalk.bold(r.id)}  ${r.status.padEnd(9)}  ${String(visit).padEnd(12)}  ${chalk.dim(r.createdAt)}`;
  });
  const footer = page.nextCursor
    ? chalk.dim(`\nNext page: --cursor ${page.nextCursor}`)
    : chalk.dim('\n(end of list)');
  return [chalk.bold('Reports:'), ...rows, footer].join('\n');
}

export interface NoteLike {
  id: string;
  reportId: string;
  authorId: string;
  kind: 'text' | 'voice' | 'image' | 'document';
  body: string | null;
  fileId: string | null;
  transcript: string | null;
  createdAt: string;
  updatedAt: string;
}

export function renderNote(n: NoteLike): string {
  const lines = [
    `${chalk.bold(`Note ${n.id}`)} ${chalk.dim(`(${n.kind})`)}`,
    `  Report:   ${n.reportId}`,
    `  Author:   ${n.authorId}`,
    `  Created:  ${n.createdAt}`,
  ];
  if (n.body) lines.push(`  Body:     ${n.body}`);
  if (n.fileId) lines.push(`  File:     ${n.fileId}`);
  if (n.transcript) lines.push(`  Transcript: ${n.transcript}`);
  return lines.join('\n');
}

export function renderNoteList(
  page: { items: NoteLike[]; nextCursor?: string | null },
): string {
  if (page.items.length === 0) {
    return chalk.dim('No notes.');
  }
  const rows = page.items.map((n) => {
    const preview =
      n.body && n.body.length > 0
        ? n.body.length > 60
          ? n.body.slice(0, 57) + '...'
          : n.body
        : chalk.dim('(no text)');
    return `  ${chalk.bold(n.id)}  ${n.kind.padEnd(8)}  ${preview}`;
  });
  const footer = page.nextCursor
    ? chalk.dim(`\nNext page: --cursor ${page.nextCursor}`)
    : chalk.dim('\n(end of list)');
  return [chalk.bold('Notes:'), ...rows, footer].join('\n');
}

export interface MemberLike {
  userId: string;
  displayName: string | null;
  phone: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: string;
}

export function renderMember(m: MemberLike): string {
  const name = m.displayName ?? chalk.dim('(no display name)');
  return [
    `${chalk.bold(name)} ${chalk.dim(`<${m.phone}>`)} ${chalk.dim(`(${m.role})`)}`,
    `  User ID:  ${m.userId}`,
    `  Joined:   ${m.joinedAt}`,
  ].join('\n');
}

export function renderMemberList(page: { items: MemberLike[] }): string {
  if (page.items.length === 0) {
    return chalk.dim('No members.');
  }
  const rows = page.items.map((m) => {
    const name = m.displayName ?? chalk.dim('(no name)');
    return `  ${chalk.bold(name).padEnd(30)}  ${m.role.padEnd(6)}  ${m.phone.padEnd(16)}  ${chalk.dim(m.userId)}`;
  });
  return [chalk.bold('Members:'), ...rows].join('\n');
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, ' ');
}

export interface FileLike {
  id: string;
  ownerId: string;
  kind: string;
  fileKey: string;
  sizeBytes: number;
  contentType: string;
  createdAt: string;
}

export function renderFile(f: FileLike): string {
  return [
    `${chalk.bold(f.id)} ${chalk.dim(`(${f.kind})`)}`,
    `  Owner:    ${f.ownerId}`,
    `  Key:      ${f.fileKey}`,
    `  Size:     ${f.sizeBytes} bytes`,
    `  Type:     ${f.contentType}`,
    `  Created:  ${f.createdAt}`,
  ].join('\n');
}
