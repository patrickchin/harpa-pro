/**
 * Upload screen — scoped to the currently-open report.
 *
 * High-level UX: the user picks a local file; the screen detects the
 * file kind from the extension (voice/image/document/pdf) and the
 * content-type, streams it through presign → R2 PUT → register via
 * `uploadFile()`, then offers to attach it to the current report as
 * a note in one prompt. No manual size, kind, or content-type
 * picker — that's what the file is for.
 *
 * Power-user surface (`Developer › Raw API › files`) still exposes
 * the raw presign / register / url leaves for debugging.
 */
import path from 'node:path';
import chalk from 'chalk';
import type { Screen, ScreenAction, ScreenContext } from '../screen.js';
import { uploadFile, type FileKind } from '../../commands/files.js';
import { createApiClient } from '../../lib/client.js';
import { runCommand } from '../execute.js';
import { findLeaf } from '../registry-find.js';

const EXT_TO_KIND: Record<string, FileKind> = {
  '.m4a': 'voice',
  '.mp3': 'voice',
  '.wav': 'voice',
  '.ogg': 'voice',
  '.aac': 'voice',
  '.flac': 'voice',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.heic': 'image',
  '.pdf': 'pdf',
  '.txt': 'document',
  '.md': 'document',
  '.doc': 'document',
  '.docx': 'document',
  '.rtf': 'document',
};

function detectKind(filePath: string): FileKind {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_KIND[ext] ?? 'document';
}

/** API file kind → note kind (notes don't have a 'pdf' kind). */
function noteKindFor(k: FileKind): 'voice' | 'image' | 'document' {
  return k === 'pdf' ? 'document' : k;
}

export function uploadScreen(): Screen {
  return {
    id: 'upload',
    breadcrumb: 'upload',
    async header(ctx) {
      if (ctx.session.state.kind !== 'authed') return undefined;
      const { currentReport } = ctx.session.state;
      if (!currentReport) return undefined;
      return {
        title: `Upload to report #${currentReport.number}`,
        lines: [
          chalk.dim(
            'Pick a file — kind, size, and content-type are auto-detected.',
          ),
        ],
      };
    },
    actions(ctx): ReadonlyArray<ScreenAction> {
      if (ctx.session.state.kind !== 'authed') return [];
      const { currentProject, currentReport } = ctx.session.state;
      if (!currentProject || !currentReport) return [];
      const project = currentProject.id;
      const number = currentReport.number;

      return [
        {
          kind: 'flow',
          label: 'Upload a file',
          refreshHeader: true,
          run: (innerCtx) => uploadAndAttachFlow(innerCtx, project, number),
        },
      ];
    },
  };
}

async function uploadAndAttachFlow(
  ctx: ScreenContext,
  project: string,
  reportNumber: number,
): Promise<void> {
  const { prompter, session } = ctx;
  const file = await prompter.filePath({
    label: 'Path to local file (type to filter, ↑/↓ to navigate, ⏎ to select)',
    validate: (s) => (s.trim().length === 0 ? 'required' : undefined),
  });
  if (prompter.isCancel(file)) return;

  const kind = detectKind(file);
  prompter.log.info(
    `Detected kind: ${chalk.bold(kind)} (from ${path.extname(file) || '(no extension)'})`,
  );

  const env = session.effectiveEnv();
  const client = createApiClient(env);
  prompter.log.info('Uploading…');
  const { exitCode, result } = await uploadFile({ client, file, kind });
  if (exitCode !== 0 || !result) {
    prompter.log.error('Upload failed.');
    return;
  }
  prompter.log.success(
    `Uploaded ${path.basename(file)} (${result.sizeBytes} bytes, ${result.contentType})`,
  );

  const attach = await prompter.confirm({
    label: `Attach as a ${noteKindFor(kind)} note on report #${reportNumber}?`,
    default: true,
  });
  if (prompter.isCancel(attach) || !attach) return;

  const notesCreate = findLeaf(['notes', 'create']);
  if (!notesCreate) {
    prompter.log.error('notes.create leaf missing from registry — cannot attach.');
    return;
  }
  await runCommand(prompter, session, notesCreate, {
    prefill: {
      project,
      reportNumber,
      kind: noteKindFor(kind),
      'file-id': result.fileId,
    },
  });
}
