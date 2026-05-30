/**
 * Batch coordinator for multi-photo upload batches.
 *
 * When a user picks N photos at once, they are tagged with the same
 * `batchKey`. The first job that finishes its file upload creates the
 * note; subsequent jobs append their files to that same note.
 *
 * Race safety: JS is single-threaded and the queue processes jobs
 * serially, so a simple promise guard suffices — the first job stores
 * a `createNotePromise`, subsequent jobs await it then call append.
 */

export interface BatchState {
  /** All job IDs in this batch */
  jobIds: string[];
  /** Set once the first job starts creating the note */
  createNotePromise?: Promise<string>; // resolves to noteId
  /** Set once the note is created */
  noteId?: string;
  /** Report ID for this batch */
  reportId: string;
}

export interface BatchCoordinator {
  /** Register a new batch. Returns the batchKey. */
  registerBatch(jobIds: string[], reportId: string): string;

  /** Check if a job belongs to a batch */
  getBatchForJob(jobId: string): BatchState | undefined;

  /**
   * Called when a job is ready to create/append. Returns the noteId.
   * First caller creates the note; subsequent callers append.
   */
  resolveNoteForJob(
    jobId: string,
    createNote: () => Promise<string>,
    appendFiles: (noteId: string) => Promise<void>,
  ): Promise<string>;

  /** Clean up completed batch */
  removeBatch(batchKey: string): void;

  /** Get batch key for a job (for UI grouping) */
  getBatchKey(jobId: string): string | undefined;
}

let _batchCounter = 0;
export function nextBatchKey(): string {
  _batchCounter += 1;
  return `batch_${Date.now().toString(36)}_${_batchCounter}`;
}

export function createBatchCoordinator(): BatchCoordinator {
  const batches = new Map<string, BatchState>();
  const jobToBatch = new Map<string, string>(); // jobId → batchKey

  function registerBatch(jobIds: string[], reportId: string): string {
    const key = nextBatchKey();
    batches.set(key, { jobIds, reportId });
    for (const id of jobIds) jobToBatch.set(id, key);
    return key;
  }

  function getBatchForJob(jobId: string): BatchState | undefined {
    const key = jobToBatch.get(jobId);
    return key ? batches.get(key) : undefined;
  }

  function getBatchKey(jobId: string): string | undefined {
    return jobToBatch.get(jobId);
  }

  async function resolveNoteForJob(
    jobId: string,
    createNote: () => Promise<string>,
    appendFiles: (noteId: string) => Promise<void>,
  ): Promise<string> {
    const key = jobToBatch.get(jobId);
    if (!key) {
      // Not part of a batch — just create note directly
      return createNote();
    }
    const batch = batches.get(key)!;

    if (batch.noteId) {
      // Note already created by another job — append
      await appendFiles(batch.noteId);
      return batch.noteId;
    }

    if (batch.createNotePromise) {
      // Another job is currently creating the note — wait then append
      const noteId = await batch.createNotePromise;
      await appendFiles(noteId);
      return noteId;
    }

    // First job to reach this point — create the note
    batch.createNotePromise = createNote();
    const noteId = await batch.createNotePromise;
    batch.noteId = noteId;
    return noteId;
  }

  function removeBatch(batchKey: string): void {
    const batch = batches.get(batchKey);
    if (!batch) return;
    for (const id of batch.jobIds) jobToBatch.delete(id);
    batches.delete(batchKey);
  }

  return { registerBatch, getBatchForJob, getBatchKey, resolveNoteForJob, removeBatch };
}
