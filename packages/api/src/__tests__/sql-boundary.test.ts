import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from '../db/schema.js';

const here = dirname(fileURLToPath(import.meta.url));

function serviceSource(name: string): string {
  return readFileSync(resolve(here, `../services/${name}`), 'utf8');
}

function sourceBetween(source: string, start: string, end?: string): string {
  const startAt = source.indexOf(start);
  if (startAt < 0) throw new Error(`missing source marker: ${start}`);
  if (!end) return source.slice(startAt);

  const endAt = source.indexOf(end, startAt + start.length);
  if (endAt < 0) throw new Error(`missing source marker: ${end}`);
  return source.slice(startAt, endAt);
}

describe('SQL and Drizzle boundary', () => {
  it('maps every runtime attachment table in the Drizzle schema', () => {
    const noteFiles = Reflect.get(schema, 'noteFiles');

    expect(noteFiles).toBeDefined();
    expect(getTableName(noteFiles)).toBe('note_files');
    expect(Object.keys(getTableColumns(noteFiles))).toEqual([
      'id',
      'noteId',
      'fileId',
      'thumbnailFileId',
      'position',
      'caption',
      'createdAt',
    ]);
  });

  it('uses the builder for the first ordinary-CRUD conversion slice', () => {
    const settings = serviceSource('settings.ts');
    const files = serviceSource('files.ts');
    const me = serviceSource('me.ts');

    const registerFile = sourceBetween(
      files,
      'export async function registerFile(',
      'export interface FileUploadLeaseInput',
    );
    const getFileById = sourceBetween(
      files,
      'export async function getFileById(',
    );
    const updateUser = sourceBetween(
      me,
      'export async function updateUser(',
      'export interface UsageMonth',
    );

    expect(settings).not.toContain('db.execute');
    expect(registerFile).not.toContain('db.execute');
    expect(getFileById).not.toContain('db.execute');
    expect(updateUser).not.toContain('db.execute');
  });
});
