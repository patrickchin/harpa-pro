/**
 * Public surface for the upload queue + signed-URL resolver.
 *
 * Consumers should import from `@/lib/uploads`, not the individual
 * files inside this directory.
 */
export {
  QueueProvider,
  useUploadQueueContext,
  createUploadQueue,
  type UploadQueue,
} from './QueueProvider';

export { useFileUpload, type UseFileUploadApi } from './useFileUpload';
export { useFileSignedUrl } from './useFileSignedUrl';

export {
  noteKindForUpload,
  MAX_ATTEMPTS,
  BACKOFF_BASE_MS,
  backoffMs,
  type UploadKind,
  type NoteKind,
  type EnqueueInput,
  type UploadJob,
  type JobStatus,
  type UploadResult,
  type FileRecord,
  type NoteRecord,
} from './types';

export {
  runUploadJob,
  defaultUploadDeps,
  type UploadDeps,
  type PresignedUpload,
  type RunHandlers,
} from './run-upload';
