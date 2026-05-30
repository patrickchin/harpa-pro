/**
 * Fires `onRegenerate` whenever the report needs regeneration and no
 * blocker is active. The DB-backed `needsRegeneration` flag drives
 * the effect, which makes the trigger persistent across app restarts
 * (the next foreground sees the flag still true and fires once). The
 * queue-of-one falls out naturally: while a regen is in flight
 * `isGenerating` is true, so we skip; when it resolves, React Query
 * invalidates the report row — if the flag is still true we fire
 * exactly one follow-up.
 *
 * See docs/superpowers/specs/2026-05-28-auto-regenerate-reports-design.md.
 */
import { useEffect } from 'react';

export interface UseAutoRegenerateInput {
  needsRegeneration: boolean;
  status: 'draft' | 'finalized';
  isGenerating: boolean;
  generationError: string | null;
  onRegenerate: () => void;
}

export function useAutoRegenerate({
  needsRegeneration,
  status,
  isGenerating,
  generationError,
  onRegenerate,
}: UseAutoRegenerateInput): void {
  useEffect(() => {
    if (!needsRegeneration) return;
    if (status !== 'draft') return;
    if (isGenerating) return;
    if (generationError !== null) return;
    onRegenerate();
  }, [needsRegeneration, status, isGenerating, generationError, onRegenerate]);
}
