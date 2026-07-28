interface SessionUploadQueue {
  clear(): void;
}

let activeQueue: SessionUploadQueue | null = null;

export function registerSessionUploadQueue(queue: SessionUploadQueue): () => void {
  activeQueue = queue;
  return () => {
    if (activeQueue === queue) {
      activeQueue = null;
    }
  };
}

export function clearSessionUploadQueue(): void {
  try {
    activeQueue?.clear();
  } catch {
    // Auth teardown must continue even if a queue subscriber misbehaves.
  }
}
