/**
 * Test data factories. Mints slug-format IDs (e.g. `usr_abc12def`) so
 * the values are accepted by the per-prefix DOMAIN constraints in
 * `migrations/0001_init.sql`.
 */
import type {
  UserId,
  SessionId,
  ProjectId,
  ReportId,
  NoteId,
  FileId,
  WaitlistSignupId,
} from '@harpa/api-contract';
import { newId } from '../../lib/ids.js';

export function makeUserId(): UserId {
  return newId('usr');
}

export function makeSessionId(): SessionId {
  return newId('ses');
}

export function makeProjectId(): ProjectId {
  return newId('prj');
}

export function makeReportId(): ReportId {
  return newId('rpt');
}

export function makeNoteId(): NoteId {
  return newId('not');
}

export function makeFileId(): FileId {
  return newId('fil');
}

export function makeWaitlistId(): WaitlistSignupId {
  return newId('wls');
}
