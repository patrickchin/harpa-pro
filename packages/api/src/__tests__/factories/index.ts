/**
 * Test data factories — minimal for P0. Expand in P1 as routes land.
 */
import { randomUUID } from 'node:crypto';

export function makeUserId(): string {
  return randomUUID();
}

export function makeSessionId(): string {
  return randomUUID();
}

export function makeProjectId(): string {
  return randomUUID();
}
