import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { listMigrationFiles, migrate } from '../db/migrate.js';
import { resetPool } from '../db/client.js';
import {
  makeFileId,
  makeNoteId,
  makeProjectId,
  makeReportId,
  makeUserId,
} from './factories/index.js';

const migrationsDir = fileURLToPath(new URL('../../migrations/', import.meta.url));
const migrationFiles = listMigrationFiles(migrationsDir);

const migration0009 = '0009_notes_thumbnail_file_id.sql';
const migration0010 = '0010_note_files.sql';
const migration0011 = '0011_files_project_scope.sql';

let container: StartedPostgreSqlContainer;
let url: string;
let stagedMigrationsDir: string;
let client: pg.Client;

function stageMigrationsThrough(lastFile: string): void {
  const lastIndex = migrationFiles.indexOf(lastFile);
  if (lastIndex === -1) {
    throw new Error(`Migration fixture not found: ${lastFile}`);
  }

  for (const file of migrationFiles.slice(0, lastIndex + 1)) {
    copyFileSync(join(migrationsDir, file), join(stagedMigrationsDir, file));
  }
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harpa_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  url = container.getConnectionUri();
  stagedMigrationsDir = mkdtempSync(join(tmpdir(), 'migration-backfills-'));
  client = new pg.Client({ connectionString: url });
  await client.connect();
}, 120_000);

afterAll(async () => {
  await client?.end();
  await resetPool();
  await container?.stop();
  if (stagedMigrationsDir) {
    rmSync(stagedMigrationsDir, { recursive: true, force: true });
  }
});

describe('legacy migration backfills', () => {
  it('moves image attachments through 0010 and scopes referenced files through 0011', async () => {
    stageMigrationsThrough(migration0009);
    const through0009 = await migrate(url, { dir: stagedMigrationsDir });
    expect(through0009.applied.at(-1)).toBe(migration0009);
    expect(through0009.applied).not.toContain(migration0010);

    const ownerId = makeUserId();
    const projectId = makeProjectId();
    const reportId = makeReportId();
    const imageNoteId = makeNoteId();
    const documentNoteId = makeNoteId();
    const imageFileId = makeFileId();
    const thumbnailFileId = makeFileId();
    const documentFileId = makeFileId();
    const pdfFileId = makeFileId();
    const orphanFileId = makeFileId();
    const imageCreatedAt = new Date('2026-05-29T12:34:56.000Z');

    await client.query(
      `INSERT INTO auth.users (id, phone)
       VALUES ($1, '+15550000001')`,
      [ownerId],
    );
    await client.query(
      `INSERT INTO app.projects (id, name, owner_id)
       VALUES ($1, 'Legacy project', $2)`,
      [projectId, ownerId],
    );
    await client.query(
      `INSERT INTO app.project_members (project_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [projectId, ownerId],
    );
    await client.query(
      `INSERT INTO app.files (id, owner_id, kind, file_key, size_bytes, content_type)
       VALUES
         ($1, $6, 'image',    'legacy/image.jpg',       100, 'image/jpeg'),
         ($2, $6, 'image',    'legacy/thumbnail.jpg',    20, 'image/jpeg'),
         ($3, $6, 'document', 'legacy/document.pdf',    200, 'application/pdf'),
         ($4, $6, 'pdf',      'legacy/report.pdf',      300, 'application/pdf'),
         ($5, $6, 'image',    'users/orphan/scratch',    50, 'image/jpeg')`,
      [imageFileId, thumbnailFileId, documentFileId, pdfFileId, orphanFileId, ownerId],
    );
    await client.query(
      `INSERT INTO app.reports (id, project_id, author_id, number, pdf_file_id)
       VALUES ($1, $2, $3, 1, $4)`,
      [reportId, projectId, ownerId, pdfFileId],
    );
    await client.query(
      `INSERT INTO app.notes
         (id, report_id, author_id, kind, body, file_id, thumbnail_file_id, created_at)
       VALUES
         ($1, $3, $4, 'image',    'Legacy image',    $5, $6, $7),
         ($2, $3, $4, 'document', 'Legacy document', $8, NULL, now())`,
      [
        imageNoteId,
        documentNoteId,
        reportId,
        ownerId,
        imageFileId,
        thumbnailFileId,
        imageCreatedAt,
        documentFileId,
      ],
    );

    stageMigrationsThrough(migration0010);
    expect(await migrate(url, { dir: stagedMigrationsDir })).toEqual({
      applied: [migration0010],
    });

    const noteFiles = await client.query<{
      id: string;
      note_id: string;
      file_id: string;
      thumbnail_file_id: string | null;
      position: number;
      created_at: Date;
    }>(
      `SELECT id, note_id, file_id, thumbnail_file_id, position, created_at
       FROM app.note_files`,
    );
    expect(noteFiles.rows).toHaveLength(1);
    const noteFile = noteFiles.rows[0]!;
    expect(noteFile).toMatchObject({
      note_id: imageNoteId,
      file_id: imageFileId,
      thumbnail_file_id: thumbnailFileId,
      position: 0,
    });
    expect(noteFile.id).toMatch(/^nfl_[0-9a-f]{10}$/);
    expect(noteFile.created_at.toISOString()).toBe(imageCreatedAt.toISOString());

    const notesAfter0010 = await client.query<{
      id: string;
      file_id: string | null;
      thumbnail_file_id: string | null;
    }>(
      `SELECT id, file_id, thumbnail_file_id
       FROM app.notes
       WHERE id IN ($1, $2)`,
      [imageNoteId, documentNoteId],
    );
    const imageNote = notesAfter0010.rows.find((row) => row.id === imageNoteId);
    const documentNote = notesAfter0010.rows.find((row) => row.id === documentNoteId);
    expect(imageNote).toEqual({
      id: imageNoteId,
      file_id: null,
      thumbnail_file_id: null,
    });
    expect(documentNote).toEqual({
      id: documentNoteId,
      file_id: documentFileId,
      thumbnail_file_id: null,
    });

    stageMigrationsThrough(migration0011);
    expect(await migrate(url, { dir: stagedMigrationsDir })).toEqual({
      applied: [migration0011],
    });

    const scopedFiles = await client.query<{
      id: string;
      project_id: string | null;
      report_id: string | null;
    }>(
      `SELECT id, project_id, report_id
       FROM app.files
       WHERE id IN ($1, $2, $3, $4, $5)`,
      [imageFileId, thumbnailFileId, documentFileId, pdfFileId, orphanFileId],
    );
    expect(scopedFiles.rows).toHaveLength(5);
    const scopeByFileId = new Map(scopedFiles.rows.map((row) => [row.id, row]));

    for (const referencedFileId of [
      imageFileId,
      thumbnailFileId,
      documentFileId,
      pdfFileId,
    ]) {
      expect(scopeByFileId.get(referencedFileId)).toEqual({
        id: referencedFileId,
        project_id: projectId,
        report_id: reportId,
      });
    }
    expect(scopeByFileId.get(orphanFileId)).toEqual({
      id: orphanFileId,
      project_id: null,
      report_id: null,
    });
  });
});
