/**
 * TUI sidecar entries for commands whose citty wrappers pre-date the
 * `defineHarpaCommand` helper. Each entry uses `defineTuiEntry` to
 * attach a `tuiSpec` + `execute` factory to an existing citty command
 * without touching its `run` block — keeps the migration additive and
 * leaves the integration-test handler functions undisturbed.
 *
 * Once a leaf is registered here AND removed from the registry test's
 * `TUI_OPTED_OUT` set, `harpa tui` exposes it under the right group.
 *
 * Intentional duplication with the citty handlers: the request/format
 * pair is repeated here. A follow-up commit can DRY by lifting each
 * pair into a shared builder per command, but that is a refactor of
 * the existing handlers, not part of this TUI migration.
 *
 * See docs/v4/arch-tui.md §3.2.
 */
import chalk from 'chalk';
import { defineTuiEntry, type HarpaCommand } from '../lib/command.js';
import { renderUser, renderUsage, renderProject, renderProjectList,
  renderReport, renderReportList, renderNote, renderNoteList,
  renderMemberList, renderAiSettings, type AiSettingsLike } from '../lib/render.js';
import type { ArgsDef } from 'citty';

// citty leaves
import { otpStartCommand, otpVerifyCommand, logoutCommand } from '../commands/auth.js';
import { meGetCommand, meUpdateCommand, meUsageCommand } from '../commands/me.js';
import { settingsAiGetCommand, settingsAiSetCommand } from '../commands/settings.js';
import {
  projectsListCommand, projectsCreateCommand, projectsGetCommand,
  projectsUpdateCommand, projectsDeleteCommand,
} from '../commands/projects.js';
import {
  membersListCommand, membersAddCommand, membersRemoveCommand,
} from '../commands/members.js';
import {
  reportsListCommand, reportsCreateCommand, reportsGetCommand,
  reportsUpdateCommand, reportsDeleteCommand,
} from '../commands/reports.js';
import {
  reportsGenerateCommand, reportsRegenerateCommand,
  reportsFinalizeCommand, reportsPdfCommand,
} from '../commands/reports-ai.js';
import {
  notesListCommand, notesCreateCommand, notesUpdateCommand, notesDeleteCommand,
} from '../commands/notes.js';
import {
  filesPresignCommand, filesRegisterCommand, filesUrlCommand,
} from '../commands/files.js';
import { voiceTranscribeCommand, voiceSummarizeCommand } from '../commands/voice.js';

const PHONE_PLACEHOLDER = '+15551234567';

/* -------------------------------------------------------------------------- */
/*  auth                                                                       */
/* -------------------------------------------------------------------------- */

export const authOtpStartTui = defineTuiEntry({
  cittyCommand: otpStartCommand,
  tui: {
    group: 'auth', label: 'Start OTP', hint: 'Send a one-time code to a phone',
    cittyPath: ['auth', 'otp', 'start'], requiresToken: false,
    args: {
      phone: { label: 'Phone', required: true, prompt: { kind: 'phone', placeholder: PHONE_PLACEHOLDER } },
    },
  },
  execute: ({ client, args }) => ({
    request: () => client.POST('/auth/otp/start', { body: { phone: String(args.phone) } }),
    format: (data) => `${chalk.green('✓')} OTP sent. Verification ID: ${data.verificationId}`,
  }),
});

export const authOtpVerifyTui = defineTuiEntry({
  cittyCommand: otpVerifyCommand,
  tui: {
    group: 'auth', label: 'Verify OTP', hint: 'Confirm a one-time passcode and sign in',
    cittyPath: ['auth', 'otp', 'verify'], requiresToken: false,
    args: {
      phone: { label: 'Phone', required: true, prompt: { kind: 'phone', placeholder: PHONE_PLACEHOLDER } },
      code: {
        label: 'Code', required: true,
        prompt: { kind: 'text', validate: (s) => (/^\d{4,8}$/.test(s) ? undefined : 'must be 4–8 digits') },
      },
    },
  },
  execute: ({ client, args }) => ({
    request: () => client.POST('/auth/otp/verify', {
      body: { phone: String(args.phone), code: String(args.code) },
    }),
    format: (data) => {
      const name = data.user.displayName ?? data.user.phone;
      return [
        `${chalk.green('✓')} Verified as ${chalk.bold(name)} ${chalk.dim(`<${data.user.phone}>`)}`,
        '',
        chalk.dim('Export the token to use authenticated commands:'),
        `  export HARPA_TOKEN=${data.token}`,
      ].join('\n');
    },
  }),
});

export const authLogoutTui = defineTuiEntry({
  cittyCommand: logoutCommand,
  tui: {
    group: 'auth', label: 'Log out', hint: 'Revoke the current session token',
    cittyPath: ['auth', 'logout'], requiresToken: true, args: {},
  },
  execute: ({ client }) => ({
    request: () => client.POST('/auth/logout', {}),
    format: () => `${chalk.green('✓')} Logged out. The bearer token is no longer valid; unset HARPA_TOKEN.`,
  }),
});

/* -------------------------------------------------------------------------- */
/*  me                                                                         */
/* -------------------------------------------------------------------------- */

export const meGetTui = defineTuiEntry({
  cittyCommand: meGetCommand,
  tui: {
    group: 'me', label: 'Show profile', hint: 'GET /me',
    cittyPath: ['me', 'get'], requiresToken: true, args: {},
  },
  execute: ({ client }) => ({
    request: () => client.GET('/me', {}),
    format: (data) => renderUser(data.user),
  }),
});

export const meUpdateTui = defineTuiEntry({
  cittyCommand: meUpdateCommand,
  tui: {
    group: 'me', label: 'Update profile', hint: 'Set display name / company name',
    cittyPath: ['me', 'update'], requiresToken: true,
    args: {
      'display-name': { label: 'Display name', required: false, prompt: { kind: 'text', placeholder: 'leave blank to skip' } },
      'company-name': { label: 'Company name', required: false, prompt: { kind: 'text', placeholder: 'leave blank to skip' } },
    },
  },
  execute: ({ client, args }) => {
    const body: { displayName?: string; companyName?: string } = {};
    const dn = args['display-name']; const cn = args['company-name'];
    if (typeof dn === 'string' && dn.length > 0) body.displayName = dn;
    if (typeof cn === 'string' && cn.length > 0) body.companyName = cn;
    return {
      request: () => client.PATCH('/me', { body }),
      format: (data) => renderUser(data.user),
    };
  },
});

export const meUsageTui = defineTuiEntry({
  cittyCommand: meUsageCommand,
  tui: {
    group: 'me', label: 'Show usage', hint: 'Monthly + lifetime counts',
    cittyPath: ['me', 'usage'], requiresToken: true, args: {},
  },
  execute: ({ client }) => ({
    request: () => client.GET('/me/usage', {}),
    format: (data) => renderUsage(data),
  }),
});

/* -------------------------------------------------------------------------- */
/*  settings                                                                   */
/* -------------------------------------------------------------------------- */

const VENDOR_OPTIONS = [
  { value: 'kimi', label: 'kimi' },
  { value: 'openai', label: 'openai' },
  { value: 'anthropic', label: 'anthropic' },
  { value: 'google', label: 'google' },
  { value: 'zai', label: 'zai' },
  { value: 'deepseek', label: 'deepseek' },
] as const;

export const settingsAiGetTui = defineTuiEntry({
  cittyCommand: settingsAiGetCommand,
  tui: {
    group: 'settings', label: 'Get AI settings', hint: 'GET /settings/ai',
    cittyPath: ['settings', 'ai', 'get'], requiresToken: true, args: {},
  },
  execute: ({ client }) => ({
    request: () => client.GET('/settings/ai'),
    format: (data) => renderAiSettings(data as AiSettingsLike),
  }),
});

export const settingsAiSetTui = defineTuiEntry({
  cittyCommand: settingsAiSetCommand,
  tui: {
    group: 'settings', label: 'Set AI settings', hint: 'Pick vendor and model',
    cittyPath: ['settings', 'ai', 'set'], requiresToken: true,
    args: {
      vendor: { label: 'Vendor', required: true, prompt: { kind: 'select', options: VENDOR_OPTIONS } },
      model: { label: 'Model identifier', required: true, prompt: { kind: 'text', placeholder: 'e.g. moonshot-v1-32k' } },
    },
  },
  execute: ({ client, args }) => {
    type Vendor = 'kimi' | 'openai' | 'anthropic' | 'google' | 'zai' | 'deepseek';
    const body: { vendor?: Vendor; model?: string } = {};
    if (args.vendor) body.vendor = String(args.vendor) as Vendor;
    if (args.model) body.model = String(args.model);
    return {
      request: () => client.PATCH('/settings/ai', { body }),
      format: (data) =>
        `${chalk.green('✓')} AI settings updated\n${renderAiSettings(data as AiSettingsLike)}`,
    };
  },
});

/* -------------------------------------------------------------------------- */
/*  projects                                                                   */
/* -------------------------------------------------------------------------- */

const PROJECT_PLACEHOLDER = 'prj_xxxxxxxx';

export const projectsListTui = defineTuiEntry({
  cittyCommand: projectsListCommand,
  tui: {
    group: 'projects', label: 'List projects', hint: 'GET /projects',
    cittyPath: ['projects', 'list'], requiresToken: true,
    args: {
      cursor: { label: 'Cursor', required: false, prompt: { kind: 'text', placeholder: 'leave blank for first page' } },
      limit: { label: 'Page size', required: false, prompt: { kind: 'number', min: 1, max: 100, default: 20 } },
    },
  },
  execute: ({ client, args }) => {
    const query: Record<string, string | number> = {};
    if (typeof args.cursor === 'string' && args.cursor.length > 0) query.cursor = args.cursor;
    if (typeof args.limit === 'number' && Number.isFinite(args.limit)) query.limit = args.limit;
    return {
      request: () => client.GET('/projects', { params: { query } }),
      format: (data) => renderProjectList(data),
    };
  },
});

export const projectsCreateTui = defineTuiEntry({
  cittyCommand: projectsCreateCommand,
  tui: {
    group: 'projects', label: 'Create project', hint: 'POST /projects',
    cittyPath: ['projects', 'create'], requiresToken: true,
    args: {
      name: { label: 'Project name', required: true, prompt: { kind: 'text' } },
      'client-name': { label: 'Client name', required: false, prompt: { kind: 'text', placeholder: 'leave blank to skip' } },
      address: { label: 'Site address', required: false, prompt: { kind: 'text', placeholder: 'leave blank to skip' } },
    },
  },
  execute: ({ client, args }) => {
    const body: { name: string; clientName?: string; address?: string } = { name: String(args.name) };
    const cn = args['client-name']; const ad = args.address;
    if (typeof cn === 'string' && cn.length > 0) body.clientName = cn;
    if (typeof ad === 'string' && ad.length > 0) body.address = ad;
    return {
      request: () => client.POST('/projects', { body }),
      format: (data) => `${chalk.green('✓')} Created project ${chalk.bold(data.name)} (${data.id})`,
    };
  },
});

export const projectsGetTui = defineTuiEntry({
  cittyCommand: projectsGetCommand,
  tui: {
    group: 'projects', label: 'Show project', hint: 'GET /projects/{id}',
    cittyPath: ['projects', 'get'], requiresToken: true,
    args: {
      id: { label: 'Project slug', required: true, prompt: { kind: 'text', placeholder: PROJECT_PLACEHOLDER } },
    },
  },
  execute: ({ client, args }) => ({
    request: () => client.GET('/projects/{project}', { params: { path: { project: String(args.id) } } }),
    format: (data) => renderProject(data),
  }),
});

export const projectsUpdateTui = defineTuiEntry({
  cittyCommand: projectsUpdateCommand,
  tui: {
    group: 'projects', label: 'Update project', hint: 'PATCH /projects/{id}',
    cittyPath: ['projects', 'update'], requiresToken: true,
    args: {
      id: { label: 'Project slug', required: true, prompt: { kind: 'text', placeholder: PROJECT_PLACEHOLDER } },
      name: { label: 'New name', required: false, prompt: { kind: 'text', placeholder: 'leave blank to keep' } },
      'client-name': { label: 'New client name', required: false, prompt: { kind: 'text', placeholder: 'leave blank to keep' } },
      address: { label: 'New address', required: false, prompt: { kind: 'text', placeholder: 'leave blank to keep' } },
    },
  },
  execute: ({ client, args }) => {
    const body: { name?: string; clientName?: string; address?: string } = {};
    const nm = args.name; const cn = args['client-name']; const ad = args.address;
    if (typeof nm === 'string' && nm.length > 0) body.name = nm;
    if (typeof cn === 'string' && cn.length > 0) body.clientName = cn;
    if (typeof ad === 'string' && ad.length > 0) body.address = ad;
    return {
      request: () => client.PATCH('/projects/{project}', {
        params: { path: { project: String(args.id) } }, body,
      }),
      format: (data) => `${chalk.green('✓')} Updated project ${chalk.bold(data.name)} (${data.id})`,
    };
  },
});

export const projectsDeleteTui = defineTuiEntry({
  cittyCommand: projectsDeleteCommand,
  tui: {
    group: 'projects', label: 'Delete project', hint: 'DELETE /projects/{id} (owner only)',
    cittyPath: ['projects', 'delete'], requiresToken: true,
    args: {
      id: { label: 'Project slug', required: true, prompt: { kind: 'text', placeholder: PROJECT_PLACEHOLDER } },
    },
  },
  execute: ({ client, args }) => ({
    request: () => client.DELETE('/projects/{project}', {
      params: { path: { project: String(args.id) } },
    }),
    format: () => `${chalk.green('✓')} Deleted project ${args.id}`,
    formatJson: () => JSON.stringify({ ok: true }, null, 2),
  }),
});

/* -------------------------------------------------------------------------- */
/*  projects members                                                           */
/* -------------------------------------------------------------------------- */

const ROLE_OPTIONS = [
  { value: 'editor', label: 'editor', hint: 'default' },
  { value: 'viewer', label: 'viewer' },
  { value: 'owner', label: 'owner' },
] as const;

export const membersListTui = defineTuiEntry({
  cittyCommand: membersListCommand,
  tui: {
    group: 'projects', label: 'List members', hint: 'GET /projects/{id}/members',
    cittyPath: ['projects', 'members', 'list'], requiresToken: true,
    args: {
      projectId: { label: 'Project slug', required: true, prompt: { kind: 'text', placeholder: PROJECT_PLACEHOLDER } },
    },
  },
  execute: ({ client, args }) => ({
    request: () => client.GET('/projects/{project}/members', {
      params: { path: { project: String(args.projectId) } },
    }),
    format: (data) => renderMemberList(data),
  }),
});

export const membersAddTui = defineTuiEntry({
  cittyCommand: membersAddCommand,
  tui: {
    group: 'projects', label: 'Add member', hint: 'POST /projects/{id}/members (owner only)',
    cittyPath: ['projects', 'members', 'add'], requiresToken: true,
    args: {
      projectId: { label: 'Project slug', required: true, prompt: { kind: 'text', placeholder: PROJECT_PLACEHOLDER } },
      phone: { label: 'Phone', required: true, prompt: { kind: 'phone', placeholder: PHONE_PLACEHOLDER } },
      role: { label: 'Role', required: false, prompt: { kind: 'select', options: ROLE_OPTIONS } },
    },
  },
  execute: ({ client, args }) => {
    const body: { phone: string; role?: 'owner' | 'editor' | 'viewer' } = { phone: String(args.phone) };
    if (args.role) body.role = args.role as 'owner' | 'editor' | 'viewer';
    return {
      request: () => client.POST('/projects/{project}/members', {
        params: { path: { project: String(args.projectId) } }, body,
      }),
      format: (data) =>
        `${chalk.green('✓')} Added member ${chalk.bold(data.displayName ?? data.phone)} ${chalk.dim(`<${data.phone}>`)} as ${data.role}`,
    };
  },
});

export const membersRemoveTui = defineTuiEntry({
  cittyCommand: membersRemoveCommand,
  tui: {
    group: 'projects', label: 'Remove member', hint: 'DELETE /projects/{id}/members/{phone} (owner only)',
    cittyPath: ['projects', 'members', 'remove'], requiresToken: true,
    args: {
      projectId: { label: 'Project slug', required: true, prompt: { kind: 'text', placeholder: PROJECT_PLACEHOLDER } },
      phone: { label: 'Member phone', required: true, prompt: { kind: 'phone', placeholder: PHONE_PLACEHOLDER } },
    },
  },
  execute: ({ client, args }) => {
    const projectId = String(args.projectId);
    const phone = String(args.phone);
    return {
      request: async () => {
        const list = await client.GET('/projects/{project}/members', {
          params: { path: { project: projectId } },
        });
        if (list.error || !list.data) return list as never;
        const member = list.data.items.find((m: { phone: string }) => m.phone === phone);
        if (!member) {
          return {
            response: new Response(
              JSON.stringify({ error: { code: 'NOT_FOUND', message: `no member ${phone} in ${projectId}` } }),
              { status: 404, headers: { 'content-type': 'application/json' } },
            ),
            error: { error: { code: 'NOT_FOUND', message: `no member ${phone} in ${projectId}` } },
          } as never;
        }
        return client.DELETE('/projects/{project}/members/{user}', {
          params: { path: { project: projectId, user: member.userId } },
        });
      },
      format: () => `${chalk.green('✓')} Removed ${chalk.dim(`<${phone}>`)} from project ${projectId}`,
      formatJson: () => JSON.stringify({ ok: true }, null, 2),
    };
  },
});

/* -------------------------------------------------------------------------- */
/*  reports                                                                    */
/* -------------------------------------------------------------------------- */

export const reportsListTui = defineTuiEntry({
  cittyCommand: reportsListCommand,
  tui: {
    group: 'reports', label: 'List reports', hint: 'GET /projects/{id}/reports',
    cittyPath: ['reports', 'list'], requiresToken: true,
    args: {
      projectId: { label: 'Project slug', required: true, prompt: { kind: 'text', placeholder: PROJECT_PLACEHOLDER } },
      cursor: { label: 'Cursor', required: false, prompt: { kind: 'text', placeholder: 'leave blank for first page' } },
      limit: { label: 'Page size', required: false, prompt: { kind: 'number', min: 1, max: 100, default: 20 } },
    },
  },
  execute: ({ client, args }) => {
    const query: Record<string, string | number> = {};
    if (typeof args.cursor === 'string' && args.cursor.length > 0) query.cursor = args.cursor;
    if (typeof args.limit === 'number' && Number.isFinite(args.limit)) query.limit = args.limit;
    return {
      request: () => client.GET('/projects/{project}/reports', {
        params: { path: { project: String(args.projectId) }, query },
      }),
      format: (data) => renderReportList(data),
    };
  },
});

export const reportsCreateTui = defineTuiEntry({
  cittyCommand: reportsCreateCommand,
  tui: {
    group: 'reports', label: 'Create report', hint: 'POST /projects/{id}/reports',
    cittyPath: ['reports', 'create'], requiresToken: true,
    args: {
      projectId: { label: 'Project slug', required: true, prompt: { kind: 'text', placeholder: PROJECT_PLACEHOLDER } },
      'visit-date': { label: 'Visit date (yyyy-mm-dd)', required: false, prompt: { kind: 'text', placeholder: '2026-01-15' } },
    },
  },
  execute: ({ client, args }) => {
    const body: { visitDate?: string } = {};
    const vd = args['visit-date'];
    if (typeof vd === 'string' && vd.length > 0) body.visitDate = vd;
    return {
      request: () => client.POST('/projects/{project}/reports', {
        params: { path: { project: String(args.projectId) } }, body,
      }),
      format: (data) => `${chalk.green('✓')} Created report #${data.number} ${chalk.dim(data.id)} (${data.status})`,
    };
  },
});

const reportPathArgs = {
  project: { label: 'Project slug', required: true, prompt: { kind: 'text' as const, placeholder: PROJECT_PLACEHOLDER } },
  number: { label: 'Report number', required: true, prompt: { kind: 'number' as const, min: 1 } },
};

export const reportsGetTui = defineTuiEntry({
  cittyCommand: reportsGetCommand,
  tui: {
    group: 'reports', label: 'Show report', hint: 'GET /projects/{project}/reports/{number}',
    cittyPath: ['reports', 'get'], requiresToken: true, args: reportPathArgs,
  },
  execute: ({ client, args }) => ({
    request: () => client.GET('/projects/{project}/reports/{number}', {
      params: { path: { project: String(args.project), number: Number(args.number) } },
    }),
    format: (data) => renderReport(data),
  }),
});

export const reportsUpdateTui = defineTuiEntry({
  cittyCommand: reportsUpdateCommand,
  tui: {
    group: 'reports', label: 'Update report', hint: 'PATCH /projects/{project}/reports/{number} (draft only)',
    cittyPath: ['reports', 'update'], requiresToken: true,
    args: {
      ...reportPathArgs,
      'visit-date': { label: 'Visit date (yyyy-mm-dd)', required: false, prompt: { kind: 'text', placeholder: 'leave blank to keep' } },
    },
  },
  execute: ({ client, args }) => {
    const body: { visitDate?: string } = {};
    const vd = args['visit-date'];
    if (typeof vd === 'string' && vd.length > 0) body.visitDate = vd;
    return {
      request: () => client.PATCH('/projects/{project}/reports/{number}', {
        params: { path: { project: String(args.project), number: Number(args.number) } }, body,
      }),
      format: (data) => `${chalk.green('✓')} Updated report #${data.number} ${chalk.dim(data.id)}`,
    };
  },
});

export const reportsDeleteTui = defineTuiEntry({
  cittyCommand: reportsDeleteCommand,
  tui: {
    group: 'reports', label: 'Delete report', hint: 'DELETE /projects/{project}/reports/{number}',
    cittyPath: ['reports', 'delete'], requiresToken: true, args: reportPathArgs,
  },
  execute: ({ client, args }) => ({
    request: () => client.DELETE('/projects/{project}/reports/{number}', {
      params: { path: { project: String(args.project), number: Number(args.number) } },
    }),
    format: () => `${chalk.green('✓')} Deleted report ${args.project}#${args.number}`,
    formatJson: () => JSON.stringify({ ok: true }, null, 2),
  }),
});

/* -------------------------------------------------------------------------- */
/*  reports — AI                                                               */
/* -------------------------------------------------------------------------- */

const aiArgs = {
  ...reportPathArgs,
  fixture: { label: 'Fixture name (replay mode)', required: false, prompt: { kind: 'text' as const, placeholder: 'leave blank to skip' } },
  'idempotency-key': { label: 'Idempotency key', required: false, prompt: { kind: 'text' as const, placeholder: 'leave blank to skip' } },
};

function aiHeadersBody(args: Record<string, unknown>): {
  body: { fixtureName?: string }; headers?: Record<string, string>;
} {
  const body: { fixtureName?: string } = {};
  const fx = args.fixture;
  if (typeof fx === 'string' && fx.length > 0) body.fixtureName = fx;
  const idem = args['idempotency-key'];
  const headers = typeof idem === 'string' && idem.length > 0
    ? { 'idempotency-key': idem } : undefined;
  return headers ? { body, headers } : { body };
}

export const reportsGenerateTui = defineTuiEntry({
  cittyCommand: reportsGenerateCommand,
  tui: {
    group: 'reports', label: 'Generate report (AI)', hint: 'POST /projects/{project}/reports/{number}/generate',
    cittyPath: ['reports', 'generate'], requiresToken: true, args: aiArgs,
  },
  execute: ({ client, args }) => {
    const { body, headers } = aiHeadersBody(args);
    return {
      request: () => client.POST('/projects/{project}/reports/{number}/generate', {
        params: { path: { project: String(args.project), number: Number(args.number) } },
        body, ...(headers ? { headers } : {}),
      }),
      format: (data) =>
        `${chalk.green('✓')} Generated report #${data.report.number} ${chalk.dim(data.report.id)}\n${renderReport(data.report)}`,
    };
  },
});

export const reportsRegenerateTui = defineTuiEntry({
  cittyCommand: reportsRegenerateCommand,
  tui: {
    group: 'reports', label: 'Regenerate report (AI)', hint: 'POST /projects/{project}/reports/{number}/regenerate',
    cittyPath: ['reports', 'regenerate'], requiresToken: true, args: aiArgs,
  },
  execute: ({ client, args }) => {
    const { body, headers } = aiHeadersBody(args);
    return {
      request: () => client.POST('/projects/{project}/reports/{number}/regenerate', {
        params: { path: { project: String(args.project), number: Number(args.number) } },
        body, ...(headers ? { headers } : {}),
      }),
      format: (data) =>
        `${chalk.green('✓')} Regenerated report #${data.report.number} ${chalk.dim(data.report.id)}\n${renderReport(data.report)}`,
    };
  },
});

export const reportsFinalizeTui = defineTuiEntry({
  cittyCommand: reportsFinalizeCommand,
  tui: {
    group: 'reports', label: 'Finalize report', hint: 'Freeze status from draft → finalized',
    cittyPath: ['reports', 'finalize'], requiresToken: true, args: reportPathArgs,
  },
  execute: ({ client, args }) => ({
    request: () => client.POST('/projects/{project}/reports/{number}/finalize', {
      params: { path: { project: String(args.project), number: Number(args.number) } },
    }),
    format: (data) =>
      `${chalk.green('✓')} Finalized report #${data.report.number} ${chalk.dim(data.report.id)}\n${renderReport(data.report)}`,
  }),
});

export const reportsPdfTui = defineTuiEntry({
  cittyCommand: reportsPdfCommand,
  tui: {
    group: 'reports', label: 'Render PDF', hint: 'POST /projects/{project}/reports/{number}/pdf',
    cittyPath: ['reports', 'pdf'], requiresToken: true, args: reportPathArgs,
  },
  execute: ({ client, args }) => ({
    request: () => client.POST('/projects/{project}/reports/{number}/pdf', {
      params: { path: { project: String(args.project), number: Number(args.number) } },
    }),
    format: (data) =>
      `${chalk.green('✓')} PDF ready\n  URL:        ${data.url}\n  Expires at: ${data.expiresAt}`,
  }),
});

/* -------------------------------------------------------------------------- */
/*  notes                                                                      */
/* -------------------------------------------------------------------------- */

const NOTE_KIND_OPTIONS = [
  { value: 'text', label: 'text' },
  { value: 'voice', label: 'voice' },
  { value: 'image', label: 'image' },
  { value: 'document', label: 'document' },
] as const;

/** Resolve {projectSlug, reportNumber} → reportId via the same GET the citty
 * handler uses. Surfaced as the outer request thunk's apiError when the
 * resolve fails. */
function resolveReportThunk(
  client: import('../lib/client.js').ApiClient,
  project: string,
  number: number,
  then: (reportId: string) =>
    Promise<{ data?: unknown; error?: unknown; response: Response }>,
): Promise<{ data?: unknown; error?: unknown; response: Response }> {
  return client.GET('/projects/{project}/reports/{number}', {
    params: { path: { project, number } },
  }).then((res) => {
    if (res.error || !res.data) return res as never;
    return then((res.data as { id: string }).id);
  });
}

export const notesListTui = defineTuiEntry({
  cittyCommand: notesListCommand,
  tui: {
    group: 'notes', label: 'List notes', hint: 'GET /reports/{report}/notes',
    cittyPath: ['notes', 'list'], requiresToken: true,
    args: {
      project: { label: 'Project slug', required: true, prompt: { kind: 'text', placeholder: PROJECT_PLACEHOLDER } },
      reportNumber: { label: 'Report number', required: true, prompt: { kind: 'number', min: 1 } },
      cursor: { label: 'Cursor', required: false, prompt: { kind: 'text', placeholder: 'leave blank for first page' } },
      limit: { label: 'Page size', required: false, prompt: { kind: 'number', min: 1, max: 100, default: 20 } },
    },
  },
  execute: ({ client, args }) => {
    const project = String(args.project);
    const number = Number(args.reportNumber);
    const query: Record<string, string | number> = {};
    if (typeof args.cursor === 'string' && args.cursor.length > 0) query.cursor = args.cursor;
    if (typeof args.limit === 'number' && Number.isFinite(args.limit)) query.limit = args.limit;
    return {
      request: () => resolveReportThunk(client, project, number, (reportId) =>
        client.GET('/reports/{report}/notes', {
          params: { path: { report: reportId }, query },
        }),
      ),
      format: (data) => renderNoteList(data as Parameters<typeof renderNoteList>[0]),
    };
  },
});

export const notesCreateTui = defineTuiEntry({
  cittyCommand: notesCreateCommand,
  tui: {
    group: 'notes', label: 'Create note', hint: 'POST /reports/{report}/notes',
    cittyPath: ['notes', 'create'], requiresToken: true,
    args: {
      project: { label: 'Project slug', required: true, prompt: { kind: 'text', placeholder: PROJECT_PLACEHOLDER } },
      reportNumber: { label: 'Report number', required: true, prompt: { kind: 'number', min: 1 } },
      kind: { label: 'Note kind', required: true, prompt: { kind: 'select', options: NOTE_KIND_OPTIONS } },
      body: { label: 'Body', required: true, prompt: { kind: 'multiline', placeholder: 'note text' }, skipWhen: (a) => a.kind !== 'text' },
      'file-id': { label: 'File ID', required: true, prompt: { kind: 'uuid' }, skipWhen: (a) => a.kind === 'text' },
      transcript: { label: 'Transcript', required: false, prompt: { kind: 'multiline', placeholder: 'optional, voice only' }, skipWhen: (a) => a.kind !== 'voice' },
    },
  },
  execute: ({ client, args }) => {
    const project = String(args.project);
    const number = Number(args.reportNumber);
    const noteBody: {
      kind: 'text' | 'voice' | 'image' | 'document';
      body?: string; fileId?: string; transcript?: string;
    } = { kind: args.kind as 'text' | 'voice' | 'image' | 'document' };
    if (typeof args.body === 'string' && args.body.length > 0) noteBody.body = args.body;
    const fid = args['file-id'];
    if (typeof fid === 'string' && fid.length > 0) noteBody.fileId = fid;
    if (typeof args.transcript === 'string' && args.transcript.length > 0) noteBody.transcript = args.transcript;
    return {
      request: () => resolveReportThunk(client, project, number, (reportId) =>
        client.POST('/reports/{report}/notes', {
          params: { path: { report: reportId } }, body: noteBody,
        }),
      ),
      format: (data) => `${chalk.green('✓')} Created note ${chalk.bold((data as { id: string }).id)}`,
    };
  },
});

export const notesUpdateTui = defineTuiEntry({
  cittyCommand: notesUpdateCommand,
  tui: {
    group: 'notes', label: 'Update note', hint: 'PATCH /notes/{noteId}',
    cittyPath: ['notes', 'update'], requiresToken: true,
    args: {
      noteId: { label: 'Note ID', required: true, prompt: { kind: 'uuid' } },
      body: { label: 'New body (blank to clear)', required: true, prompt: { kind: 'multiline' } },
    },
  },
  execute: ({ client, args }) => {
    const newBody = args.body === '' ? null : String(args.body);
    return {
      request: () => client.PATCH('/notes/{note}', {
        params: { path: { note: String(args.noteId) } },
        body: { body: newBody },
      }),
      format: (data) =>
        `${chalk.green('✓')} Updated note ${chalk.bold(data.id)}\n${renderNote(data)}`,
    };
  },
});

export const notesDeleteTui = defineTuiEntry({
  cittyCommand: notesDeleteCommand,
  tui: {
    group: 'notes', label: 'Delete note', hint: 'DELETE /notes/{noteId}',
    cittyPath: ['notes', 'delete'], requiresToken: true,
    args: {
      noteId: { label: 'Note ID', required: true, prompt: { kind: 'uuid' } },
    },
  },
  execute: ({ client, args }) => ({
    request: () => client.DELETE('/notes/{note}', {
      params: { path: { note: String(args.noteId) } },
    }),
    format: () => `${chalk.green('✓')} Deleted note ${args.noteId}`,
    formatJson: () => JSON.stringify({ ok: true }, null, 2),
  }),
});

/* -------------------------------------------------------------------------- */
/*  files                                                                      */
/* -------------------------------------------------------------------------- */

const FILE_KIND_OPTIONS = [
  { value: 'voice', label: 'voice' },
  { value: 'image', label: 'image' },
  { value: 'document', label: 'document' },
  { value: 'pdf', label: 'pdf' },
] as const;

export const filesPresignTui = defineTuiEntry({
  cittyCommand: filesPresignCommand,
  tui: {
    group: 'files', label: 'Presign upload', hint: 'POST /files/presign',
    cittyPath: ['files', 'presign'], requiresToken: true,
    args: {
      kind: { label: 'File kind', required: true, prompt: { kind: 'select', options: FILE_KIND_OPTIONS } },
      'content-type': { label: 'Content type', required: true, prompt: { kind: 'text', placeholder: 'audio/m4a, image/jpeg, application/pdf, …' } },
      size: { label: 'Size in bytes', required: true, prompt: { kind: 'number', min: 1 } },
    },
  },
  execute: ({ client, args }) => ({
    request: () => client.POST('/files/presign', {
      body: {
        kind: args.kind as 'voice' | 'image' | 'document' | 'pdf',
        contentType: String(args['content-type']),
        sizeBytes: Number(args.size),
      },
    }),
    format: (data) =>
      [
        `${chalk.green('✓')} Presigned upload URL`,
        `  File key:   ${data.fileKey}`,
        `  Upload URL: ${data.uploadUrl}`,
        `  Expires at: ${data.expiresAt}`,
      ].join('\n'),
  }),
});

export const filesRegisterTui = defineTuiEntry({
  cittyCommand: filesRegisterCommand,
  tui: {
    group: 'files', label: 'Register file', hint: 'POST /files',
    cittyPath: ['files', 'register'], requiresToken: true,
    args: {
      kind: { label: 'File kind', required: true, prompt: { kind: 'select', options: FILE_KIND_OPTIONS } },
      'file-key': { label: 'File key (from presign)', required: true, prompt: { kind: 'text' } },
      'content-type': { label: 'Content type', required: true, prompt: { kind: 'text' } },
      size: { label: 'Size in bytes', required: true, prompt: { kind: 'number', min: 1 } },
    },
  },
  execute: ({ client, args }) => ({
    request: () => client.POST('/files', {
      body: {
        kind: args.kind as 'voice' | 'image' | 'document' | 'pdf',
        fileKey: String(args['file-key']),
        contentType: String(args['content-type']),
        sizeBytes: Number(args.size),
      },
    }),
    format: (data) =>
      `${chalk.green('✓')} Registered file ${chalk.bold(data.id)} (${data.kind}, ${data.sizeBytes} bytes)`,
  }),
});

export const filesUrlTui = defineTuiEntry({
  cittyCommand: filesUrlCommand,
  tui: {
    group: 'files', label: 'Get signed URL', hint: 'GET /files/{id}/url',
    cittyPath: ['files', 'url'], requiresToken: true,
    args: {
      fileId: { label: 'File ID', required: true, prompt: { kind: 'uuid' } },
    },
  },
  execute: ({ client, args }) => ({
    request: () => client.GET('/files/{id}/url', {
      params: { path: { id: String(args.fileId) } },
    }),
    format: (data) =>
      [
        `${chalk.green('✓')} Signed download URL`,
        `  URL:        ${data.url}`,
        `  Expires at: ${data.expiresAt}`,
      ].join('\n'),
  }),
});

// `files upload` is intentionally NOT exposed in the TUI: the
// command chains presign → PUT-to-R2 → register, which doesn't fit the
// single-request-thunk shape the TUI execute path expects. It stays in
// the registry test's TUI_OPTED_OUT list with a follow-up note.

/* -------------------------------------------------------------------------- */
/*  voice                                                                      */
/* -------------------------------------------------------------------------- */

const voiceCommonArgs = {
  fixture: { label: 'Fixture name (replay mode)', required: false, prompt: { kind: 'text' as const, placeholder: 'leave blank to skip' } },
  'idempotency-key': { label: 'Idempotency key', required: false, prompt: { kind: 'text' as const, placeholder: 'leave blank to skip' } },
};

function voiceHeaders(args: Record<string, unknown>): Record<string, string> | undefined {
  const idem = args['idempotency-key'];
  return typeof idem === 'string' && idem.length > 0
    ? { 'idempotency-key': idem } : undefined;
}

export const voiceTranscribeTui = defineTuiEntry({
  cittyCommand: voiceTranscribeCommand,
  tui: {
    group: 'voice', label: 'Transcribe', hint: 'POST /voice/transcribe',
    cittyPath: ['voice', 'transcribe'], requiresToken: true,
    args: {
      'file-id': { label: 'Voice file ID', required: true, prompt: { kind: 'uuid' } },
      ...voiceCommonArgs,
    },
  },
  execute: ({ client, args }) => {
    const fileId = String(args['file-id']);
    const fx = args.fixture;
    const body: { fileId: string; fixtureName?: string } = { fileId };
    if (typeof fx === 'string' && fx.length > 0) body.fixtureName = fx;
    const headers = voiceHeaders(args);
    return {
      request: () => client.POST('/voice/transcribe', {
        body, ...(headers ? { headers } : {}),
      }),
      format: (data) => `${chalk.bold('Transcript:')} ${data.transcript}`,
    };
  },
});

export const voiceSummarizeTui = defineTuiEntry({
  cittyCommand: voiceSummarizeCommand,
  tui: {
    group: 'voice', label: 'Summarize', hint: 'POST /voice/summarize',
    cittyPath: ['voice', 'summarize'], requiresToken: true,
    args: {
      transcript: { label: 'Transcript', required: true, prompt: { kind: 'multiline' } },
      ...voiceCommonArgs,
    },
  },
  execute: ({ client, args }) => {
    const transcript = String(args.transcript);
    const fx = args.fixture;
    const body: { transcript: string; fixtureName?: string } = { transcript };
    if (typeof fx === 'string' && fx.length > 0) body.fixtureName = fx;
    const headers = voiceHeaders(args);
    return {
      request: () => client.POST('/voice/summarize', {
        body, ...(headers ? { headers } : {}),
      }),
      format: (data) => `${chalk.bold('Summary:')} ${data.summary}`,
    };
  },
});

/* -------------------------------------------------------------------------- */
/*  Aggregate                                                                  */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tuiEntries: ReadonlyArray<HarpaCommand<ArgsDef, any>> = [
  authOtpStartTui, authOtpVerifyTui, authLogoutTui,
  meGetTui, meUpdateTui, meUsageTui,
  settingsAiGetTui, settingsAiSetTui,
  projectsListTui, projectsCreateTui, projectsGetTui, projectsUpdateTui, projectsDeleteTui,
  membersListTui, membersAddTui, membersRemoveTui,
  reportsListTui, reportsCreateTui, reportsGetTui, reportsUpdateTui, reportsDeleteTui,
  reportsGenerateTui, reportsRegenerateTui, reportsFinalizeTui, reportsPdfTui,
  notesListTui, notesCreateTui, notesUpdateTui, notesDeleteTui,
  filesPresignTui, filesRegisterTui, filesUrlTui,
  voiceTranscribeTui, voiceSummarizeTui,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
] as unknown as ReadonlyArray<HarpaCommand<ArgsDef, any>>;
