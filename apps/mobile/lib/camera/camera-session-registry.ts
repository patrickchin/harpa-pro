/**
 * Camera ↔ caller handoff registry.
 *
 * Ported verbatim from
 * `../haru3-reports/apps/mobile/lib/camera-session-registry.ts` on
 * branch `dev`.
 *
 * Avoids cramming a JSON-stringified `string[]` into router params
 * (which is unsafe — URL-encoding, length limits, lossy on cold
 * restart) and avoids a global pub-sub event the rest of the app
 * would have to learn about.
 *
 * Lifecycle:
 *
 *   1. caller        : sessionId = createCameraSession({ returnTo })
 *   2. caller        : router.push("/(camera)/capture", { sessionId, returnTo })
 *   3. capture screen: commitCameraSession(sessionId, uris) on Done
 *   4. caller        : useFocusEffect → consumeCameraSession(sessionId)
 *
 * Sessions are single-use — `consume` removes the entry. If the user
 * cancels or the OS evicts the camera screen, the registry leaks one
 * empty entry until the caller re-focuses (which clears it).
 */

export interface CameraSessionInit {
  /** Pathname the caller wants to return to (informational only). */
  returnTo: string;
  /** Caller-defined free-form payload (e.g. `{ projectId, reportId }`). */
  context?: Record<string, unknown>;
}

interface CameraSession extends CameraSessionInit {
  id: string;
  /** URIs committed by the camera screen on Done. Empty until committed. */
  result: string[] | null;
  createdAt: number;
}

const sessions = new Map<string, CameraSession>();

let counter = 0;
function nextId(now: number): string {
  counter += 1;
  return `cam-${now.toString(36)}-${counter.toString(36)}`;
}

/** Create a new session and return its id. */
export function createCameraSession(init: CameraSessionInit, now: number = Date.now()): string {
  const id = nextId(now);
  sessions.set(id, { ...init, id, result: null, createdAt: now });
  return id;
}

/** Look up a session (camera screen reads context by id). */
export function getCameraSession(id: string): CameraSession | undefined {
  return sessions.get(id);
}

/**
 * Camera screen calls this on Done to publish results back to the caller.
 * Returns false when the session no longer exists so the camera can delete
 * cache files that no caller accepted ownership of.
 */
export function commitCameraSession(id: string, uris: string[]): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  session.result = uris;
  return true;
}

/**
 * Find committed sessions whose `context.reportId` matches the given
 * report id. Used by callers that may have been UNMOUNTED while the
 * camera modal was presented (root uses `<Slot />` — pushing into the
 * `(camera)` group swaps the slot and the `(app)` tree remounts on
 * return, so local React state holding the session id is gone).
 *
 * Returns committed session ids only; uncommitted (user cancelled) and
 * unrelated sessions are skipped. The caller drains each via
 * `consumeCameraSession`.
 */
export function findCommittedSessionsForReport(reportId: string): string[] {
  const out: string[] = [];
  for (const session of sessions.values()) {
    if (
      session.result != null &&
      (session.context as { reportId?: string } | undefined)?.reportId === reportId
    ) {
      out.push(session.id);
    }
  }
  return out;
}

/**
 * Caller drains the result. Returns `undefined` if the session doesn't
 * exist OR has not been committed yet (i.e. user cancelled). Either
 * way the entry is cleaned up.
 */
export function consumeCameraSession(id: string): string[] | undefined {
  const session = sessions.get(id);
  sessions.delete(id);
  if (!session || session.result == null) return undefined;
  return session.result;
}

/** Test-only: drop everything. */
export function __resetCameraSessionsForTests(): void {
  sessions.clear();
  counter = 0;
}
