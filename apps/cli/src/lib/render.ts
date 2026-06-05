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
  email: string;
  displayName: string | null;
  companyName: string | null;
  createdAt: string;
}

export function renderUser(user: UserLike): string {
  const name = user.displayName ?? chalk.dim('(no display name)');
  const company = user.companyName ?? chalk.dim('(no company)');
  return [
    `${chalk.bold(name)} ${chalk.dim(`<${user.email}>`)}`,
    `  Company:   ${company}`,
    `  Joined:    ${user.createdAt}`,
  ].join('\n');
}

export interface UsageMonth {
  month: string;
  reports: number;
  voiceNotes: number;
}

export interface UsageTokenMonth {
  month: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  calls: number;
}

export interface UsageByModelRow {
  vendor: string;
  model: string;
  operation: 'chat' | 'transcribe' | 'generate_report';
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export interface UsageLike {
  months: UsageMonth[];
  totals: {
    reports: number;
    voiceNotes: number;
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    calls?: number;
  };
  usageTokens?: UsageTokenMonth[];
  usageByModel?: UsageByModelRow[];
}

export function renderUsage(usage: UsageLike): string {
  const tokensByMonth = new Map<string, UsageTokenMonth>();
  for (const t of usage.usageTokens ?? []) tokensByMonth.set(t.month, t);

  const header = chalk.bold('Month     Reports  Voice notes  Calls   In tok   Out tok');
  const rows = usage.months.map((m) => {
    const t = tokensByMonth.get(m.month);
    const calls = t?.calls ?? 0;
    const inTok = t?.inputTokens ?? 0;
    const outTok = t?.outputTokens ?? 0;
    return `${m.month}   ${pad(m.reports, 7)}  ${pad(m.voiceNotes, 11)}  ${pad(calls, 5)}  ${pad(inTok, 7)}  ${pad(outTok, 7)}`;
  });
  const totals = `${chalk.dim('Total     ')}${pad(usage.totals.reports, 7)}  ${pad(usage.totals.voiceNotes, 11)}  ${pad(usage.totals.calls ?? 0, 5)}  ${pad(usage.totals.inputTokens ?? 0, 7)}  ${pad(usage.totals.outputTokens ?? 0, 7)}`;
  const lines: string[] = [header, ...rows, chalk.dim('—'.repeat(56)), totals];
  if (usage.usageByModel && usage.usageByModel.length > 0) {
    lines.push('', chalk.bold('Per-model'));
    lines.push(chalk.bold('Vendor    Model                Op               Calls   In tok   Out tok'));
    for (const r of usage.usageByModel) {
      lines.push(
        `${pad(r.vendor, 9)} ${pad(r.model, 20)} ${pad(r.operation, 16)} ${pad(r.calls, 5)}  ${pad(r.inputTokens, 7)}  ${pad(r.outputTokens, 7)}`,
      );
    }
  }
  return lines.join('\n');
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
  number: number;
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
    `${chalk.bold(`Report #${r.number}`)} ${chalk.dim(r.id)} ${chalk.dim(`(${r.status})`)}`,
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
    const head = `#${String(r.number).padEnd(4)} ${chalk.dim(r.id)}`;
    return `  ${chalk.bold(head)}  ${r.status.padEnd(9)}  ${String(visit).padEnd(12)}  ${chalk.dim(r.createdAt)}`;
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
  email: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: string;
}

export function renderMember(m: MemberLike): string {
  const name = m.displayName ?? chalk.dim('(no display name)');
  return [
    `${chalk.bold(name)} ${chalk.dim(`<${m.email}>`)} ${chalk.dim(`(${m.role})`)}`,
    `  Joined:   ${m.joinedAt}`,
  ].join('\n');
}

export function renderMemberList(page: { items: MemberLike[] }): string {
  if (page.items.length === 0) {
    return chalk.dim('No members.');
  }
  const rows = page.items.map((m) => {
    const name = m.displayName ?? chalk.dim('(no name)');
    return `  ${chalk.bold(name).padEnd(30)}  ${m.role.padEnd(6)}  ${chalk.dim(m.email)}`;
  });
  return [chalk.bold('Members:'), ...rows].join('\n');
}

function pad(n: number | string, width: number): string {
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

export interface AiSettingsLike {
  vendor: string | null;
  model: string | null;
}

export function renderAiSettings(s: AiSettingsLike): string {
  if (s.vendor === null && s.model === null) {
    return [
      `${chalk.bold('AI settings')}`,
      `  Vendor:  ${chalk.dim('(server default)')}`,
      `  Model:   ${chalk.dim('(server default)')}`,
    ].join('\n');
  }
  return [
    `${chalk.bold('AI settings')}`,
    `  Vendor:  ${s.vendor ?? '(server default)'}`,
    `  Model:   ${s.model ?? '(server default)'}`,
  ].join('\n');
}
